import { afterEach, describe, expect, jest, test } from "bun:test";
import { logger } from "../../logger";
import { NoOpInstrumentation } from "../noop-instrumentation";
import { listenClientConfig, PgListener } from "../pg-listener";
import { FakePgListenClient } from "./fake-pg-listen-client";

function makeListener(overrides: { failConnect?: boolean } = {}) {
  const created: FakePgListenClient[] = [];
  let reconnects = 0;
  const listener = new PgListener(
    {
      channel: "test_channel",
      label: "test",
      owner: "PgListenerTest",
      connectionString: "postgres://unused",
      onNotification: () => {},
      onReconnect: () => {
        reconnects++;
      },
    },
    logger,
    new NoOpInstrumentation(),
    {
      createClient: () => {
        const client = new FakePgListenClient();
        client.connectRejects = overrides.failConnect === true;
        created.push(client);
        return client;
      },
    },
  );
  return { listener, created, reconnects: () => reconnects };
}

async function advance(ms: number): Promise<void> {
  jest.advanceTimersByTime(ms);
  for (let i = 0; i < 20; i++) await Promise.resolve();
}

afterEach(() => {
  jest.useRealTimers();
});

describe("PgListener keepalive", () => {
  test("reconnects with exponential backoff from 250 ms capped at 15 s", async () => {
    jest.useFakeTimers();
    const { listener, created } = makeListener({ failConnect: true });
    await listener.start();

    for (const delay of [250, 500, 1_000, 2_000, 4_000, 8_000, 15_000, 15_000]) {
      const before = created.length;
      await advance(delay - 1);
      expect(created).toHaveLength(before);
      await advance(1);
      expect(created).toHaveLength(before + 1);
    }

    await listener.stop();
  });

  test("sends select 1 every 15 s and reconnects when it fails", async () => {
    jest.useFakeTimers();
    const { listener, created } = makeListener();
    await listener.start();
    const first = created[0];
    if (!first) throw new Error("client not created");

    await advance(15_000);
    expect(first.queries.filter((text) => text === "select 1")).toHaveLength(1);

    first.heartbeatRejects = true;
    await advance(15_000);
    expect(first.ended).toBe(true);
    expect(first.relaying).toBe(false);

    await advance(250);
    expect(created).toHaveLength(2);
    expect(created[1]?.relaying).toBe(true);

    await listener.stop();
  });

  test("a query_timeout is set on the listening client", () => {
    const config = listenClientConfig("postgres://unused");

    expect(config.query_timeout).toBeGreaterThan(0);
    expect(config.connectionTimeoutMillis).toBeGreaterThan(0);
  });

  test("a notification during reconnect triggers one catch-up drain", async () => {
    jest.useFakeTimers();
    const { listener, created, reconnects } = makeListener();
    await listener.start();
    expect(reconnects()).toBe(0);

    created[0]?.killBackend();
    await advance(250);

    expect(created).toHaveLength(2);
    expect(reconnects()).toBe(1);

    await listener.stop();
  });
});
