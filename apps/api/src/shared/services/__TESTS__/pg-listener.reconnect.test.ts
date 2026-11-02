import { describe, expect, test } from "bun:test";
import { logger } from "../../logger";
import { NoOpInstrumentation } from "../noop-instrumentation";
import { type PgListenClient, PgListener } from "../pg-listener";
import { FakePgListenClient } from "./fake-pg-listen-client";

function makeListener(
  overrides: { failConnect?: boolean; suspendConnect?: boolean; failFirstConnect?: boolean } = {},
) {
  const created: FakePgListenClient[] = [];
  const received: Array<string | undefined> = [];
  const listener = new PgListener(
    {
      channel: "test_channel",
      label: "test",
      owner: "PgListenerTest",
      connectionString: "postgres://unused",
      onNotification: (payload) => received.push(payload),
    },
    logger,
    new NoOpInstrumentation(),
    {
      createClient: () => {
        const client = new FakePgListenClient();
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
  return { listener, created, received };
}

const liveClient = (listener: PgListener) =>
  (listener as unknown as { listenClient: PgListenClient | null }).listenClient;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("PgListener reconnection", () => {
  test("a failure schedules a single reconnection and leaves a single live client", async () => {
    const { listener, created } = makeListener();
    await listener.start();
    expect(created).toHaveLength(1);

    created[0]?.killBackend();
    await wait(80);

    expect(created).toHaveLength(2);
    expect(created.filter((client) => client.relaying)).toHaveLength(1);
    expect(created[0]?.ended).toBe(true);

    await listener.stop();
  });

  test("repeated failures do not grow the number of live clients", async () => {
    const { listener, created } = makeListener();
    await listener.start();

    for (let i = 0; i < 4; i++) {
      created.at(-1)?.killBackend();
      await wait(80);
    }

    expect(created).toHaveLength(5);
    expect(created.filter((client) => client.relaying)).toHaveLength(1);
    expect(created.slice(0, -1).every((client) => client.ended)).toBe(true);

    await listener.stop();
  });

  test("a NOTIFY after N failures is delivered exactly once", async () => {
    const { listener, created, received } = makeListener();
    await listener.start();

    for (let i = 0; i < 3; i++) {
      created.at(-1)?.killBackend();
      await wait(80);
    }

    for (const client of created) client.deliver("u1");

    expect(received).toEqual(["u1"]);

    await listener.stop();
  });

  test("stop() cancels the pending reconnection and tears down the current client", async () => {
    const { listener, created } = makeListener();
    await listener.start();

    created[0]?.killBackend();
    await listener.stop();
    await wait(120);

    expect(created).toHaveLength(1);
    expect(created[0]?.ended).toBe(true);
  });

  test("an error while connect() is in flight never adopts that client and schedules a single reconnection", async () => {
    const { listener, created } = makeListener({ suspendConnect: true });
    const connecting = listener.start();
    await wait(0); // lets start() reach `await client.connect()`

    const client = created[0];
    expect(created).toHaveLength(1);
    if (!client) throw new Error("client not created");

    // The failure lands while `connect()` is still pending.
    client.killBackend();
    // `connect()` only resolves now, once the client is already disposed.
    client.releaseConnect();
    await connecting;

    expect(liveClient(listener)).toBeNull();
    expect(created).toHaveLength(1); // no second client before the backoff expires

    await wait(80);

    expect(created).toHaveLength(2); // a single reconnection was scheduled
    expect(created.filter((c) => c.relaying)).toHaveLength(1);
    expect(created[0]?.ended).toBe(true);
    expect(liveClient(listener)).toBe(created[1] ?? null);

    await listener.stop();
  });

  test("an in-flight failure followed by a failing connect() schedules a single reconnection", async () => {
    // The only path where both scheduleReconnect() calls really happen.
    // `dispose()` removes the listeners synchronously, so the `end` following an
    // `error` calls nothing back: the double scheduling cannot come from there.
    // It comes from here: the `error` handler schedules while `connect()` is in
    // flight, then `connect()` rejects and the `catch` schedules a second time.
    // Without the single-flight guard, two timers arm two connections, which is
    // what this test counts.
    const { listener, created } = makeListener({ suspendConnect: true, failFirstConnect: true });
    const connecting = listener.start();
    await wait(0); // lets start() reach `await client.connect()`

    const client = created[0];
    if (!client) throw new Error("client not created");

    client.killBackend(); // 1st scheduleReconnect, from the `error` handler
    client.releaseConnect(); // connect() rejects, 2nd scheduleReconnect from the `catch`
    await connecting;

    expect(liveClient(listener)).toBeNull();

    // A single backoff has elapsed: with one reconnection in flight there is one
    // more client. Without the guard there are two, armed at 25 and 50 ms.
    await wait(90);

    expect(created).toHaveLength(2);
    expect(created.filter((c) => c.relaying)).toHaveLength(1);

    await listener.stop();
  });

  test("the backoff does not reset on a connection that was never established", async () => {
    const { listener, created } = makeListener({ failConnect: true });
    await listener.start();

    // Attempts at t=0, t=25, t=75, t=175 when the backoff doubles.
    await wait(50);
    expect(created).toHaveLength(2);
    await wait(70);
    expect(created).toHaveLength(3);

    await listener.stop();
  });
});
