import { describe, expect, test } from "bun:test";
import { Option, onEvent, Result } from "@packages/ddd-kit";
import { EventTypes } from "@packages/events";
import { mockPort } from "@packages/test/bun";
import { mockUnitOfWork } from "@packages/test/bun/unit-of-work";
import { mockInstrumentation } from "../../../__TESTS__/mock-instrumentation";
import { logger } from "../../logger";
import type { IOutboxRepository, OutboxRecord } from "../../ports/outbox.port";
import { OutboxDispatcher } from "../outbox-dispatcher.service";
import type { OutboxSubscriber } from "../outbox-subscriber";
import { FakePgListenClient } from "./fake-pg-listen-client";

const TYPE = EventTypes.USER_CREATED;

const RECORD: OutboxRecord = {
  id: "evt-1",
  eventType: TYPE,
  aggregateId: "u1",
  aggregateType: "user",
  organizationId: Option.none(),
  payload: {},
  metadata: { specversion: "1.0", source: "test", datacontenttype: "application/json" },
  occurredAt: new Date(),
  attempts: 1,
  deadAt: Option.none(),
  deliveries: {},
};

function makeDispatcher() {
  const outbox = mockPort<IOutboxRepository>();
  outbox.claim.mockResolvedValue(Result.fail("outbox_unavailable: connection refused"));
  outbox.pendingState.mockResolvedValue(
    Result.ok({ dueInMs: Option.none<number>(), oldestPendingSeconds: 0 }),
  );
  outbox.markDelivered.mockResolvedValue(Result.ok(true));
  const instrumentation = mockInstrumentation();
  const client = new FakePgListenClient();
  const subscribers: OutboxSubscriber[] = [];
  const dispatcher = new OutboxDispatcher(
    outbox,
    subscribers,
    logger,
    "postgres://unused",
    instrumentation,
    {
      relay: {
        eventTypes: [TYPE],
        batchSize: 50,
        maxAttempts: 10,
        leaseSeconds: 120,
        deadRetrySeconds: 21_600,
        concurrency: 4,
        handlerBudgetSeconds: 30,
      },
      uow: mockUnitOfWork().unitOfWork,
      stopGraceMs: 10_000,
      listener: { createClient: () => client },
    },
  );
  return { dispatcher, client, outbox, instrumentation };
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("OutboxDispatcher", () => {
  test("a first drain that fails is reported instead of crashing the process", async () => {
    const { dispatcher, instrumentation } = makeDispatcher();

    await dispatcher.start();
    await wait(10);

    expect(instrumentation.capture).toHaveBeenCalled();

    await dispatcher.stop();
  });

  test("a NOTIFY on the listen connection triggers a drain", async () => {
    const { dispatcher, client, outbox } = makeDispatcher();
    outbox.claim.mockResolvedValue(Result.ok([]));
    await dispatcher.start();
    await wait(10);
    const before = outbox.claim.mock.calls.length;

    client.deliver("");
    await wait(10);

    expect(outbox.claim.mock.calls.length).toBe(before + 1);

    await dispatcher.stop();
  });

  test("stop waits for the running drain then claims nothing more", async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { dispatcher, outbox } = makeDispatcher();
    outbox.claim.mockImplementationOnce(async () => {
      await gate;
      return Result.ok([]);
    });
    await dispatcher.start();
    await wait(5);

    let stopped = false;
    const stopping = dispatcher.stop().then(() => {
      stopped = true;
    });
    await wait(20);
    const stoppedBeforeRelease = stopped;
    release();
    await stopping;
    const claimsAtStop = outbox.claim.mock.calls.length;
    await wait(80);

    expect(stoppedBeforeRelease).toBe(false);
    expect(stopped).toBe(true);
    expect(outbox.claim.mock.calls.length).toBe(claimsAtStop);
  });

  test("a user handler found in the container receives the claimed event", async () => {
    const received: string[] = [];
    const handler = onEvent(TYPE, "record-user-created", () => async (event) => {
      received.push(event.eventId ?? "");
    })({});
    const { dispatcher, outbox } = makeDispatcher();
    outbox.claim.mockResolvedValueOnce(Result.ok([RECORD]));
    outbox.claim.mockResolvedValue(Result.ok([]));

    await dispatcher.start({ RecordUserCreated: handler });
    await wait(20);
    await dispatcher.stop();

    expect(received).toEqual(["evt-1"]);
    expect(Object.keys(outbox.markDelivered.mock.calls[0]?.[1] ?? {})).toEqual([
      "record-user-created",
    ]);
  });
});
