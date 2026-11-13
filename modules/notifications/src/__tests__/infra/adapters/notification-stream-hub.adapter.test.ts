import { describe, expect, test } from "bun:test";
import type { ILogger } from "@packages/ddd-kit";
import type { PgListener } from "@packages/outbox/pg-listener";
import { FakePgListenClient } from "@packages/outbox/testing/fake-pg-listen-client";
import { mockPort } from "@packages/test/bun";
import { mockInstrumentation } from "@packages/test/bun/instrumentation";
import { NotificationStreamHub } from "../../../infra/adapters/notification-stream-hub.adapter";

const makeHub = () =>
  new NotificationStreamHub(mockPort<ILogger>(), "postgres://unused", mockInstrumentation());

describe("NotificationStreamHub", () => {
  test("dispatches a signal to its recipient only", () => {
    const hub = makeHub();
    const received: string[] = [];

    hub.subscribe("u1", () => received.push("u1"));
    hub.subscribe("u2", () => received.push("u2"));

    hub.dispatchSignal("u1");

    expect(received).toEqual(["u1"]);
  });

  test("unsubscribing releases the handle", () => {
    const hub = makeHub();
    const unsubscribe = hub.subscribe("u1", () => {});

    expect(hub.subscriberCount("u1")).toBe(1);
    unsubscribe();
    expect(hub.subscriberCount("u1")).toBe(0);
  });

  test("every tab of the same user receives the signal", () => {
    const hub = makeHub();
    let calls = 0;

    hub.subscribe("u1", () => calls++);
    hub.subscribe("u1", () => calls++);
    hub.dispatchSignal("u1");

    expect(calls).toBe(2);
  });

  test("a signal for a user without subscribers leaves the others untouched", () => {
    const hub = makeHub();
    let calls = 0;
    hub.subscribe("u1", () => calls++);

    hub.dispatchSignal("unknown");

    expect(calls).toBe(0);
    expect(hub.subscriberCount("u1")).toBe(1);
  });

  test("a throwing handle does not stop the others from receiving", () => {
    const hub = makeHub();
    const received: string[] = [];
    hub.subscribe("u1", () => {
      throw new Error("dead tab");
    });
    hub.subscribe("u1", () => received.push("second"));

    hub.dispatchSignal("u1");

    expect(received).toEqual(["second"]);
  });

  test("a NOTIFY on the listen connection reaches the user named in its payload", async () => {
    const client = new FakePgListenClient();
    const hub = new NotificationStreamHub(
      mockPort<ILogger>(),
      "postgres://unused",
      mockInstrumentation(),
      {
        createClient: () => client,
      },
    );
    const listener = (hub as unknown as { listener: PgListener }).listener;
    const received: string[] = [];
    hub.subscribe("u1", () => received.push("u1"));
    hub.subscribe("u2", () => received.push("u2"));

    await listener.start();
    client.deliver("u1");

    expect(received).toEqual(["u1"]);

    await hub.stop();
  });
});
