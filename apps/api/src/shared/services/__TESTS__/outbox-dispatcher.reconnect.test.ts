import { describe, expect, test } from "bun:test";
import { logger } from "../../logger";
import { NoOpInstrumentation } from "../noop-instrumentation";
import { OutboxDispatcher, type OutboxListenClient } from "../outbox-dispatcher.service";
import type { OutboxSubscriber } from "../outbox-subscriber";

type Handler = (arg?: unknown) => void;

/**
 * Mimics the only two `pg` behaviours this dispatcher depends on: a dead
 * connection emits `error` *and* `end`, and a client keeps relaying
 * `notification` until its listeners are removed. Everything else is a stub.
 */
class FakeClient implements OutboxListenClient {
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

  /** A client is still wired into the dispatcher while it can relay a NOTIFY. */
  get relaying(): boolean {
    return !this.ended && (this.handlers.get("notification")?.length ?? 0) > 0;
  }
}

const noopSubscribers: OutboxSubscriber[] = [];

const fakeOutbox = {
  enqueue: async () => {},
  findPendingBatch: async () => [],
  markDispatched: async () => {},
  markFailed: async () => {},
};

function makeDispatcher(
  overrides: { failConnect?: boolean; suspendConnect?: boolean; failFirstConnect?: boolean } = {},
) {
  const created: FakeClient[] = [];
  const dispatcher = new OutboxDispatcher(
    fakeOutbox,
    noopSubscribers,
    logger,
    "postgres://unused",
    new NoOpInstrumentation(),
    {
      createClient: () => {
        const client = new FakeClient();
        const first = created.length === 0;
        client.connectRejects =
          overrides.failConnect === true || (overrides.failFirstConnect === true && first);
        if (overrides.suspendConnect && first) client.suspendConnect();
        created.push(client);
        return client;
      },
      reconnectBackoffMs: 25,
      reconnectMaxBackoffMs: 10_000,
    },
  );
  return { dispatcher, created };
}

const connectListener = (dispatcher: OutboxDispatcher) =>
  (dispatcher as unknown as { connectListener(): Promise<void> }).connectListener();

const liveClient = (dispatcher: OutboxDispatcher) =>
  (dispatcher as unknown as { listenClient: OutboxListenClient | null }).listenClient;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("OutboxDispatcher — reconnexion", () => {
  test("une panne ne planifie qu'une reconnexion et ne laisse qu'un client vivant", async () => {
    const { dispatcher, created } = makeDispatcher();
    await connectListener(dispatcher);
    expect(created).toHaveLength(1);

    created[0]?.killBackend();
    await wait(80);

    expect(created).toHaveLength(2);
    expect(created.filter((client) => client.relaying)).toHaveLength(1);
    expect(created[0]?.ended).toBe(true);

    await dispatcher.stop();
  });

  test("des pannes repetees ne font pas croitre le nombre de clients vivants", async () => {
    const { dispatcher, created } = makeDispatcher();
    await connectListener(dispatcher);

    for (let i = 0; i < 4; i++) {
      created.at(-1)?.killBackend();
      await wait(80);
    }

    expect(created).toHaveLength(5);
    expect(created.filter((client) => client.relaying)).toHaveLength(1);
    expect(created.slice(0, -1).every((client) => client.ended)).toBe(true);

    await dispatcher.stop();
  });

  test("stop() annule la reconnexion en attente et demonte le client courant", async () => {
    const { dispatcher, created } = makeDispatcher();
    await connectListener(dispatcher);

    created[0]?.killBackend();
    await dispatcher.stop();
    await wait(120);

    expect(created).toHaveLength(1);
    expect(created[0]?.ended).toBe(true);
  });

  test("une erreur pendant que connect() est en vol n'adopte jamais ce client, et ne planifie qu'une reconnexion", async () => {
    const { dispatcher, created } = makeDispatcher({ suspendConnect: true });
    const connecting = connectListener(dispatcher);
    await wait(0); // laisse connectListener() atteindre `await client.connect()`

    const client = created[0];
    expect(created).toHaveLength(1);
    if (!client) throw new Error("client not created");

    // La panne survient alors que `connect()` est toujours en attente.
    client.killBackend();
    // `connect()` se resout seulement maintenant — le client est deja disposed.
    client.releaseConnect();
    await connecting;

    expect(liveClient(dispatcher)).toBeNull();
    expect(created).toHaveLength(1); // pas de 2e client tant que le backoff n'a pas expire

    await wait(80);

    expect(created).toHaveLength(2); // une seule reconnexion planifiee
    expect(created.filter((c) => c.relaying)).toHaveLength(1);
    expect(created[0]?.ended).toBe(true);
    expect(liveClient(dispatcher)).toBe(created[1] ?? null);

    await dispatcher.stop();
  });

  test("une panne en vol suivie d'un connect() qui echoue ne planifie qu'une reconnexion", async () => {
    // Le seul chemin ou les deux appels a scheduleReconnect() se produisent
    // vraiment. `dispose()` retire les listeners de facon synchrone, donc le
    // `end` qui suit un `error` ne rappelle plus rien : la double planification
    // ne peut plus venir de la. Elle vient d'ici — le handler `error` planifie
    // pendant que `connect()` est en vol, puis `connect()` rejette et le `catch`
    // de connectListener planifie une seconde fois. Sans la garde d'unicite,
    // deux timers arment deux connexions, ce que ce test compte.
    const { dispatcher, created } = makeDispatcher({
      suspendConnect: true,
      failFirstConnect: true,
    });
    const connecting = connectListener(dispatcher);
    await wait(0); // laisse connectListener() atteindre `await client.connect()`

    const client = created[0];
    if (!client) throw new Error("client not created");

    client.killBackend(); // 1er scheduleReconnect, depuis le handler `error`
    client.releaseConnect(); // connect() rejette -> 2e scheduleReconnect, depuis le `catch`
    await connecting;

    expect(liveClient(dispatcher)).toBeNull();

    // Un seul backoff s'est ecoule : avec une seule reconnexion en vol il n'y a
    // qu'un client de plus. Sans la garde il y en a deux, armes a 25 et 50 ms.
    await wait(90);

    expect(created).toHaveLength(2);
    expect(created.filter((c) => c.relaying)).toHaveLength(1);

    await dispatcher.stop();
  });

  test("le backoff ne se reinitialise pas sur une connexion jamais etablie", async () => {
    const { dispatcher, created } = makeDispatcher({ failConnect: true });
    await connectListener(dispatcher);

    // Tentatives a t=0, t=25, t=75, t=175 si le backoff double bien.
    await wait(50);
    expect(created).toHaveLength(2);
    await wait(70);
    expect(created).toHaveLength(3);

    await dispatcher.stop();
  });
});
