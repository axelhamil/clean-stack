import { describe, expect, it } from "bun:test";
import { type IUseCase, Result } from "@packages/ddd-kit";
import type { DeliveredEvent } from "@packages/outbox/outbox.port";
import { mockPort } from "@packages/test/bun";
import { mockInstrumentation } from "@packages/test/bun/instrumentation";
import type { AuditError } from "../../../application/ports/repositories/audit-log.port";
import type { RecordAuditEntryInput } from "../../../application/usecases/record-audit-entry/record-audit-entry.dto";
import { AuditEventSubscriber } from "../../../infra/adapters/audit-event-subscriber.adapter";

const EVENT = {
  eventId: "e1",
  eventType: "billing.subscription.created",
  aggregateType: "subscription",
  aggregateId: "sub-1",
  payload: { actorUserId: "op-1" },
  dateOccurred: new Date("2026-07-10T00:00:00.000Z"),
} satisfies DeliveredEvent;

function given(outcome: Result<void, AuditError>) {
  const recordAuditEntry = mockPort<IUseCase<RecordAuditEntryInput, void, AuditError>>();
  recordAuditEntry.execute.mockResolvedValue(outcome);
  const subscriber = new AuditEventSubscriber(recordAuditEntry, mockInstrumentation());

  return { recordAuditEntry, subscriber };
}

describe("audit-log subscriber", () => {
  it("hands every delivered event to the record use case", async () => {
    const { recordAuditEntry, subscriber } = given(Result.ok());

    await subscriber.handle({ ...EVENT, organizationId: "org-1" });

    const [input] = recordAuditEntry.execute.mock.calls.map(([call]) => call);
    expect(input).toMatchObject({
      eventId: "e1",
      eventType: "billing.subscription.created",
      aggregateType: "subscription",
      aggregateId: "sub-1",
      payload: { actorUserId: "op-1" },
      occurredAt: EVENT.dateOccurred,
    });
    expect(input?.organizationId.toNull()).toBe("org-1");
    expect(input?.requestId.isNone()).toBe(true);
  });

  it("fails the delivery so the relay retries it when the entry is not recorded", async () => {
    const { subscriber } = given(
      Result.fail({ code: "AUDIT_PERSISTENCE_PROVIDER_FAILURE", message: "audit append failed" }),
    );

    await expect(subscriber.handle(EVENT)).rejects.toThrow("audit append failed");
  });
});
