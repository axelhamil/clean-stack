import { describe, expect, test } from "bun:test";
import { logger } from "../../logger";
import { NoOpInstrumentation } from "../noop-instrumentation";
import { type NotificationListenClient, NotificationStreamHub } from "../notification-stream-hub";

type Handler = (arg?: unknown) => void;

/**
 * Mimics the only two `pg` behaviours this hub depends on: a dead connection
 * emits `error` *and* `end`, and a client keeps relaying `notification` until
 * its listeners are removed. Everything else is a stub.
 */
class FakeClient implements NotificationListenClient {
  readonly handlers = new Map<string, Handler[]>();
  ended = false;
  listening = false;
  connectRejects = false;
  private connectGate: Promise<void> | null = null;
  private releaseConnectGate: (() => void) | null = null;

  on(event: string, listener: Handler): this {
    const existing = this.handlers.get(event) ?? [];
    existing.push(listener);
    this.handlers.set(event, existing);
    return this;
  }

  /**
   * Makes this client's `connect()` hang until `releaseConnect()` is called.
   * Lets a test land an `error` (and the `end` that follows it) while
   * `connect()` is still in flight — deterministically, instead of racing on
   * timing — to exercise the `disposed.has(client)` re-check that guards
   * against adopting a client that died mid-connect.
   */
  suspendConnect(): void {
    this.connectGate = new Promise((resolve) => {
      this.releaseConnectGate = resolve;
    });
  }

  releaseConnect(): void {
    this.releaseConnectGate?.();
  }

  async connect(): Promise<void> {
    if (this.connectGate) await this.connectGate;
    if (this.connectRejects) throw new Error("connect refused");
  }

  async query(_text: string): Promise<unknown> {
    this.listening = true;
    return {};
  }

  async end(): Promise<void> {
    this.ended = true;
  }

  removeAllListeners(): this {
    this.handlers.clear();
    return this;
  }

  private emit(event: string, arg?: unknown): void {
    for (const handler of [...(this.handlers.get(event) ?? [])]) handler(arg);
  }

  /** A killed backend: `pg` emits `error` first, then `end`. */
  killBackend(): void {
    this.emit("error", new Error("terminating connection due to administrator command"));
    this.emit("end");
  }

  deliver(userId: string): void {
    this.emit("notification", { payload: userId });
  }

  /** A client is still wired into the hub while it can relay a NOTIFY. */
  get relaying(): boolean {
    return !this.ended && (this.handlers.get("notification")?.length ?? 0) > 0;
  }
}

function makeHub(overrides: { failConnect?: boolean; suspendConnect?: boolean } = {}) {
  const created: FakeClient[] = [];
  const hub = new NotificationStreamHub(logger, "postgres://unused", new NoOpInstrumentation(), {
    createClient: () => {
      const client = new FakeClient();
      client.connectRejects = overrides.failConnect === true;
      if (overrides.suspendConnect && created.length === 0) client.suspendConnect();
      created.push(client);
      return client;
    },
    reconnectBackoffMs: 25,
    reconnectMaxBackoffMs: 10_000,
  });
  return { hub, created };
}

const liveClient = (hub: NotificationStreamHub) =>
  (hub as unknown as { listenClient: NotificationListenClient | null }).listenClient;

const connectListener = (hub: NotificationStreamHub) =>
  (hub as unknown as { connectListener(): Promise<void> }).connectListener();

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("NotificationStreamHub — reconnexion", () => {
  test("une panne ne planifie qu'une reconnexion et ne laisse qu'un client abonne", async () => {
    const { hub, created } = makeHub();
    await connectListener(hub);
    expect(created).toHaveLength(1);

    created[0]?.killBackend();
    await wait(80);

    expect(created).toHaveLength(2);
    expect(created.filter((client) => client.relaying)).toHaveLength(1);
    expect(created[0]?.ended).toBe(true);

    await hub.stop();
  });

  test("des pannes repetees ne font pas croitre le nombre de clients vivants", async () => {
    const { hub, created } = makeHub();
    await connectListener(hub);

    for (let i = 0; i < 4; i++) {
      created.at(-1)?.killBackend();
      await wait(80);
    }

    expect(created).toHaveLength(5);
    expect(created.filter((client) => client.relaying)).toHaveLength(1);
    expect(created.slice(0, -1).every((client) => client.ended)).toBe(true);

    await hub.stop();
  });

  test("un NOTIFY apres N pannes n'est distribue qu'une fois", async () => {
    const { hub, created } = makeHub();
    await connectListener(hub);

    for (let i = 0; i < 3; i++) {
      created.at(-1)?.killBackend();
      await wait(80);
    }

    let received = 0;
    hub.subscribe("u1", () => received++);
    for (const client of created) client.deliver("u1");

    expect(received).toBe(1);

    await hub.stop();
  });

  test("stop() annule la reconnexion en attente et demonte le client courant", async () => {
    const { hub, created } = makeHub();
    await connectListener(hub);

    created[0]?.killBackend();
    await hub.stop();
    await wait(120);

    expect(created).toHaveLength(1);
    expect(created[0]?.ended).toBe(true);
  });

  test("une erreur pendant que connect() est en vol n'adopte jamais ce client, et ne planifie qu'une reconnexion", async () => {
    const { hub, created } = makeHub({ suspendConnect: true });
    const connecting = connectListener(hub);
    await wait(0); // laisse connectListener() atteindre `await client.connect()`

    const client = created[0];
    expect(created).toHaveLength(1);
    if (!client) throw new Error("client not created");

    // La panne survient alors que `connect()` est toujours en attente.
    client.killBackend();
    // `connect()` se resout seulement maintenant — le client est deja disposed.
    client.releaseConnect();
    await connecting;

    expect(liveClient(hub)).toBeNull();
    expect(created).toHaveLength(1); // pas de 2e client tant que le backoff n'a pas expire

    await wait(80);

    expect(created).toHaveLength(2); // une seule reconnexion planifiee
    expect(created.filter((c) => c.relaying)).toHaveLength(1);
    expect(created[0]?.ended).toBe(true);
    expect(liveClient(hub)).toBe(created[1] ?? null);

    await hub.stop();
  });

  test("le backoff ne se reinitialise pas sur une connexion jamais etablie", async () => {
    const { hub, created } = makeHub({ failConnect: true });
    await connectListener(hub);

    // Tentatives a t=0, t=25, t=75, t=175 si le backoff double bien.
    await wait(50);
    expect(created).toHaveLength(2);
    await wait(70);
    expect(created).toHaveLength(3);

    await hub.stop();
  });
});
