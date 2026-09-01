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

  on(event: string, listener: Handler): this {
    const existing = this.handlers.get(event) ?? [];
    existing.push(listener);
    this.handlers.set(event, existing);
    return this;
  }

  async connect(): Promise<void> {
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

function makeDispatcher(overrides: { failConnect?: boolean } = {}) {
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
        client.connectRejects = overrides.failConnect === true;
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
