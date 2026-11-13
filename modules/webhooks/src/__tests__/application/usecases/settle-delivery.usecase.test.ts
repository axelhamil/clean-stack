import { beforeEach, describe, expect, it } from "bun:test";
import { type ILogger, Option, Result, UnitOfWorkContext } from "@packages/ddd-kit";
import { EventTypes } from "@packages/events";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import { enqueuedEvents } from "@packages/outbox/testing/enqueued-events";
import { mockPort, type PortMock } from "@packages/test/bun";
import { mockUnitOfWork, type UnitOfWorkMock } from "@packages/test/bun/unit-of-work";
import type { WebhookDeliverySettings } from "../../../application/config/webhook-settings";
import type {
  DeliveryFailure,
  IWebhookDeliveryRepository,
  WebhookDeliveryRecord,
} from "../../../application/ports/repositories/webhook-delivery.port";
import type {
  EndpointFailureStreak,
  IWebhookEndpointRepository,
} from "../../../application/ports/repositories/webhook-endpoint.port";
import {
  type AttemptLog,
  type DeliveryOutcome,
  failedOutcome,
} from "../../../application/services/delivery-policy.service";
import { SettleDeliveryUseCase } from "../../../application/usecases/settle-delivery/settle-delivery.usecase";
import { webhookDelivery } from "../../infra/adapters/fixtures";

const SETTINGS: WebhookDeliverySettings = {
  leaseSeconds: 330,
  deadRetrySeconds: 21_600,
  autoDisableMinFailures: 2,
  autoDisableAfterDays: 5,
  responseCaptureBytes: 4096,
  httpsOnly: false,
};
const DAY_MS = 86_400_000;
const ORG = Option.some("org-1");

let deliveries: PortMock<IWebhookDeliveryRepository>;
let endpoints: PortMock<IWebhookEndpointRepository>;
let outbox: PortMock<IOutboxRepository>;
let uow: UnitOfWorkMock;
let settledIn: unknown[];
let enqueuedIn: unknown[];

function useCase() {
  return new SettleDeliveryUseCase(
    deliveries,
    endpoints,
    uow.unitOfWork,
    outbox,
    mockPort<ILogger>(),
    SETTINGS,
  );
}

function sentLog(status: number): AttemptLog {
  return {
    requestHeaders: Option.some({ "content-type": "application/json" }),
    requestBody: Option.some("{}"),
    responseStatus: Option.some(status),
    responseHeaders: Option.none(),
    responseBody: Option.none(),
    durationMs: Option.some(12),
    error: status < 300 ? Option.none() : Option.some(`HTTP ${status}`),
  };
}

function succeeded(): DeliveryOutcome {
  return {
    verdict: { kind: "success" },
    responseStatus: Option.some(200),
    organizationId: ORG,
    attempt: Option.some({ requestSent: true, log: sentLog(200) }),
  };
}

function failedWith500(): DeliveryOutcome {
  return failedOutcome("HTTP 500: Internal Server Error", {
    responseStatus: Option.some(500),
    organizationId: ORG,
    attempt: Option.some({ requestSent: true, log: sentLog(500) }),
  });
}

function refusedDestination(): DeliveryOutcome {
  return failedOutcome("destination not publicly routable", {
    terminal: true,
    organizationId: ORG,
    attempt: Option.some({
      requestSent: false,
      log: { ...sentLog(0), requestHeaders: Option.none(), responseStatus: Option.none() },
    }),
  });
}

function streakIs(streak: EndpointFailureStreak) {
  endpoints.bumpFailure.mockResolvedValue(Result.ok(Option.some(streak)));
}

const settle = (delivery: WebhookDeliveryRecord, outcome: DeliveryOutcome) =>
  useCase().execute({ delivery, outcome });

const failures = (): DeliveryFailure[] => deliveries.markFailed.mock.calls.map(([, f]) => f);
const eventTypes = () => enqueuedEvents(outbox).map(({ eventType }) => eventType);

describe("SettleDeliveryUseCase", () => {
  beforeEach(() => {
    deliveries = mockPort<IWebhookDeliveryRepository>();
    endpoints = mockPort<IWebhookEndpointRepository>();
    outbox = mockPort<IOutboxRepository>();
    uow = mockUnitOfWork();
    settledIn = [];
    enqueuedIn = [];
    deliveries.markSuccess.mockImplementation(async () => {
      settledIn.push(UnitOfWorkContext.transaction());
      return Result.ok(true);
    });
    deliveries.markFailed.mockImplementation(async () => {
      settledIn.push(UnitOfWorkContext.transaction());
      return Result.ok(true);
    });
    deliveries.createAttempt.mockResolvedValue(Result.ok());
    endpoints.resetFailure.mockResolvedValue(Result.ok());
    endpoints.markDisabled.mockResolvedValue(Result.ok());
    endpoints.bumpFailure.mockResolvedValue(Result.ok(Option.none()));
    outbox.enqueue.mockImplementation(async () => {
      enqueuedIn.push(UnitOfWorkContext.transaction());
    });
  });

  it("settles a success, records the attempt under the lease number and resets the failure streak", async () => {
    const result = await settle(webhookDelivery({ attempts: 3 }), succeeded());

    expect(result.getValue()).toEqual({ written: true });
    expect(
      deliveries.markSuccess.mock.calls.map(([lease, status]) => [lease.id, status.unwrap()]),
    ).toEqual([["del-1", 200]]);
    expect(deliveries.createAttempt.mock.calls.map(([attempt]) => attempt)).toEqual([
      { ...sentLog(200), deliveryId: "del-1", attemptNumber: 3 },
    ]);
    expect(endpoints.resetFailure.mock.calls).toEqual([["ep-1", "org-1"]]);
    expect(eventTypes()).toEqual([]);
    expect(uow.outcome()).toBe("committed");
  });

  it("clears a replayed dead delivery that succeeds without announcing anything", async () => {
    await settle(webhookDelivery({ status: "dead_letter", attempts: 7 }), succeeded());

    expect(deliveries.markSuccess).toHaveBeenCalledTimes(1);
    expect(endpoints.resetFailure.mock.calls).toEqual([["ep-1", "org-1"]]);
    expect(eventTypes()).toEqual([]);
  });

  it("keeps a third failed send retryable with a delay and announces nothing", async () => {
    await settle(webhookDelivery({ attempts: 3 }), failedWith500());

    const [failure] = failures();
    expect(failures()).toHaveLength(1);
    expect(failure?.status).toBe("failed");
    expect(failure?.retryAfterSeconds.unwrapOr(0)).toBeGreaterThan(0);
    expect(failure?.lastError).toBe("HTTP 500: Internal Server Error");
    expect(failure?.lastResponseStatus.unwrap()).toBe(500);
    expect(eventTypes()).toEqual([]);
    expect(endpoints.bumpFailure).not.toHaveBeenCalled();
  });

  it("dead-letters after the fourth failed send and announces the first death in the same unit of work", async () => {
    await settle(webhookDelivery({ attempts: 4 }), failedWith500());

    expect(failures().map((f) => [f.status, f.retryAfterSeconds.unwrap()])).toEqual([
      ["dead_letter", 21_600],
    ]);
    expect(enqueuedEvents(outbox)).toEqual([
      {
        eventType: EventTypes.WEBHOOK_DELIVERY_EXHAUSTED,
        aggregateId: "del-1",
        payload: {
          organizationId: "org-1",
          endpointId: "ep-1",
          deliveryId: "del-1",
          eventType: "USER_CREATED",
          attempts: 4,
          actorUserId: null,
        },
      },
    ]);
    expect(endpoints.bumpFailure.mock.calls).toEqual([["ep-1", "org-1"]]);
    expect(enqueuedIn[0]).toBeDefined();
    expect(enqueuedIn[0]).toBe(settledIn[0]);
    expect(uow.outcome()).toBe("committed");
  });

  it("dead-letters a terminal failure with no retry and announces it", async () => {
    await settle(webhookDelivery(), refusedDestination());

    expect(failures()).toEqual([
      expect.objectContaining({ status: "dead_letter", retryAfterSeconds: Option.none() }),
    ]);
    expect(
      deliveries.createAttempt.mock.calls.map(([attempt]) => attempt.durationMs.unwrap()),
    ).toEqual([12]);
    expect(eventTypes()).toEqual([EventTypes.WEBHOOK_DELIVERY_EXHAUSTED]);
  });

  it.each([
    ["a retryable failure", failedWith500],
    ["a terminal failure", refusedDestination],
  ])(
    "does not announce again when an already dead delivery fails with %s",
    async (_label, outcome) => {
      await settle(webhookDelivery({ status: "dead_letter", attempts: 6 }), outcome());

      expect(failures().map((f) => f.status)).toEqual(["dead_letter"]);
      expect(eventTypes()).toEqual([]);
      expect(endpoints.bumpFailure).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["a sent request", failedWith500, 1],
    ["an unsent request", refusedDestination, 0],
  ])(
    "after losing the lease, records %s only and changes nothing else",
    async (_label, outcome, recorded) => {
      deliveries.markFailed.mockResolvedValue(Result.ok(false));

      const result = await settle(webhookDelivery({ attempts: 5 }), outcome());

      expect(result.getValue()).toEqual({ written: false });
      expect(deliveries.createAttempt).toHaveBeenCalledTimes(recorded);
      expect(eventTypes()).toEqual([]);
      expect(endpoints.bumpFailure).not.toHaveBeenCalled();
    },
  );

  it("does not reset the failure streak for a success whose lease was lost", async () => {
    deliveries.markSuccess.mockResolvedValue(Result.ok(false));

    const result = await settle(webhookDelivery(), succeeded());

    expect(result.getValue()).toEqual({ written: false });
    expect(deliveries.createAttempt).toHaveBeenCalledTimes(1);
    expect(endpoints.resetFailure).not.toHaveBeenCalled();
  });

  it("disables an endpoint whose repeated failures started long ago and announces it", async () => {
    streakIs({ consecutiveFailures: 3, firstFailedAt: new Date(Date.now() - 6 * DAY_MS) });

    await settle(webhookDelivery({ attempts: 4 }), failedWith500());

    expect(endpoints.markDisabled.mock.calls.map(([id, org]) => [id, org])).toEqual([
      ["ep-1", "org-1"],
    ]);
    expect(enqueuedEvents(outbox).map(({ eventType, payload }) => [eventType, payload])).toEqual([
      [EventTypes.WEBHOOK_DELIVERY_EXHAUSTED, expect.anything()],
      [
        EventTypes.WEBHOOK_ENDPOINT_DISABLED,
        {
          organizationId: "org-1",
          endpointId: "ep-1",
          actorUserId: null,
          reason: "delivery_failures",
          consecutiveFailures: 3,
        },
      ],
    ]);
  });

  it.each([
    [
      "too few failures",
      { consecutiveFailures: 1, firstFailedAt: new Date(Date.now() - 6 * DAY_MS) },
    ],
    ["recent failures", { consecutiveFailures: 3, firstFailedAt: new Date(Date.now() - DAY_MS) }],
  ])("keeps the endpoint enabled with %s", async (_label, streak) => {
    streakIs(streak);

    await settle(webhookDelivery({ attempts: 4 }), failedWith500());

    expect(endpoints.markDisabled).not.toHaveBeenCalled();
    expect(eventTypes()).toEqual([EventTypes.WEBHOOK_DELIVERY_EXHAUSTED]);
  });

  it("fails and announces nothing when the settle write fails", async () => {
    deliveries.markFailed.mockResolvedValue(
      Result.fail({ code: "WEBHOOK_PERSISTENCE_PROVIDER_FAILURE", message: "db down" }),
    );

    const result = await settle(webhookDelivery({ attempts: 4 }), failedWith500());

    expect(result.getError().code).toBe("WEBHOOK_PERSISTENCE_PROVIDER_FAILURE");
    expect(deliveries.createAttempt).not.toHaveBeenCalled();
    expect(eventTypes()).toEqual([]);
    expect(uow.outcome()).toBe("rolled_back");
  });
});
