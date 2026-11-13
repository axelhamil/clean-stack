import { describe, expect, it } from "bun:test";
import { AppErrorException, type IUseCase, Result } from "@packages/ddd-kit";
import type { DeliveredEvent } from "@packages/outbox/outbox.port";
import { mockPort } from "@packages/test/bun";
import { mockInstrumentation } from "@packages/test/bun/instrumentation";
import type {
  FanOutNotificationError,
  FanOutNotificationInput,
} from "../../../application/usecases/fan-out-notification/fan-out-notification.dto";
import { NotificationFanoutSubscriber } from "../../../infra/adapters/notification-fanout-subscriber.adapter";

const EVENT = {
  eventId: "e1",
  eventType: "user.password_changed",
  aggregateType: "user",
  aggregateId: "u1",
  payload: { userId: "u1" },
  dateOccurred: new Date("2026-08-07T10:00:00.000Z"),
} satisfies DeliveredEvent;

function given(outcome: Result<void, FanOutNotificationError>) {
  const fanOut = mockPort<IUseCase<FanOutNotificationInput, void, FanOutNotificationError>>();
  fanOut.execute.mockResolvedValue(outcome);
  const instrumentation = mockInstrumentation();
  const subscriber = new NotificationFanoutSubscriber(fanOut, instrumentation);

  return { fanOut, instrumentation, subscriber };
}

describe("notification fan-out subscriber", () => {
  it("hands every delivered event to the fan-out use case", async () => {
    const { fanOut, subscriber } = given(Result.ok());

    await subscriber.handle({ ...EVENT, organizationId: "org-1" });

    const [input] = fanOut.execute.mock.calls.map(([call]) => call);
    expect(input).toMatchObject({
      eventId: "e1",
      eventType: "user.password_changed",
      aggregateId: "u1",
      payload: { userId: "u1" },
      occurredAt: EVENT.dateOccurred,
    });
    expect(input?.organizationId.toNull()).toBe("org-1");
  });

  it("fails the delivery so the relay retries it, without capturing an error its reader already captured", async () => {
    const { instrumentation, subscriber } = given(
      Result.fail({
        code: "NOTIFICATION_STAFF_RECIPIENTS_PROVIDER_FAILURE",
        message: "database operation failed: recipientsOf",
      }),
    );

    await expect(subscriber.handle(EVENT)).rejects.toBeInstanceOf(AppErrorException);
    expect(instrumentation.capture).not.toHaveBeenCalled();
  });
});
