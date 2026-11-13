import { describe, expect, it } from "bun:test";
import { type IUseCase, Result } from "@packages/ddd-kit";
import type { DeliveredEvent } from "@packages/outbox/outbox.port";
import { mockPort } from "@packages/test/bun";
import { mockInstrumentation } from "@packages/test/bun/instrumentation";
import type { WebhookRepoError } from "../../../application/ports/repositories/webhook-endpoint.port";
import type { FanOutEventToEndpointsInput } from "../../../application/usecases/fan-out-event-to-endpoints/fan-out-event-to-endpoints.dto";
import { WebhookFanoutSubscriber } from "../../../infra/adapters/webhook-fanout-subscriber.adapter";

const EVENT = {
  eventId: "event-1",
  eventType: "user.created",
  aggregateType: "user",
  aggregateId: "user-1",
  payload: { userId: "user-1" },
  dateOccurred: new Date("2026-07-10T00:00:00.000Z"),
} satisfies DeliveredEvent;

function given(outcome: Result<void, WebhookRepoError>) {
  const fanOut = mockPort<IUseCase<FanOutEventToEndpointsInput, void, WebhookRepoError>>();
  fanOut.execute.mockResolvedValue(outcome);
  const subscriber = new WebhookFanoutSubscriber(fanOut, mockInstrumentation());

  return { fanOut, subscriber };
}

describe("webhook fan-out subscriber", () => {
  it("hands the delivered event and its organization to the fan-out use case", async () => {
    const { fanOut, subscriber } = given(Result.ok());

    await subscriber.handle({ ...EVENT, organizationId: "org-1" });

    const [input] = fanOut.execute.mock.calls.map(([call]) => call);
    expect(input).toMatchObject({
      eventId: "event-1",
      eventType: "user.created",
      payload: { userId: "user-1" },
    });
    expect(input?.organizationId.toNull()).toBe("org-1");
  });

  it("passes no organization when the event carries none", async () => {
    const { fanOut, subscriber } = given(Result.ok());

    await subscriber.handle(EVENT);

    const [input] = fanOut.execute.mock.calls.map(([call]) => call);
    expect(input?.organizationId.isNone()).toBe(true);
  });

  it("fails the delivery so the relay retries it when the deliveries are not written", async () => {
    const { subscriber } = given(
      Result.fail({
        code: "WEBHOOK_PERSISTENCE_PROVIDER_FAILURE",
        message: "webhook delivery enqueueFanout failed",
      }),
    );

    await expect(subscriber.handle(EVENT)).rejects.toThrow("webhook delivery enqueueFanout failed");
  });
});
