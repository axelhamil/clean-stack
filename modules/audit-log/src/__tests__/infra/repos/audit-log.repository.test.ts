import { describe, expect, it, mock } from "bun:test";
import type { ILogger } from "@packages/ddd-kit";
import * as realDrizzle from "@packages/drizzle";
import type { DeliveredEvent } from "@packages/outbox/outbox.port";
import { mockPort } from "@packages/test/bun";
import { mockInstrumentation } from "@packages/test/bun/instrumentation";
import { mockUnitOfWork } from "@packages/test/bun/unit-of-work";
import { RecordAuditEntryUseCase } from "../../../application/usecases/record-audit-entry/record-audit-entry.usecase";
import { AuditEventSubscriber } from "../../../infra/adapters/audit-event-subscriber.adapter";
import { sha256AuditHasher } from "../../../infra/adapters/sha256-audit-hasher.adapter";

const PG_CAUSE =
  'null value in column "metadata" of relation "audit_log" violates not-null constraint';

const insert = () => {
  const chain = {
    values: () => chain,
    onConflictDoNothing: () => chain,
    toSQL: () => ({ sql: "insert" }),
    execute: async () => {
      throw new Error("Failed query: insert into audit_log", { cause: new Error(PG_CAUSE) });
    },
  };
  return chain;
};

mock.module("@packages/drizzle", () => ({
  ...realDrizzle,
  resolveExecutor: () => ({ insert }),
}));

const { DrizzleAuditLogRepository } = await import(
  "../../../infra/repos/drizzle/audit-log.repository"
);

const EVENT = {
  eventId: "e1",
  eventType: "billing.subscription.created",
  aggregateType: "subscription",
  aggregateId: "sub-1",
  payload: { actorUserId: "op-1" },
  dateOccurred: new Date("2026-07-10T00:00:00.000Z"),
} satisfies DeliveredEvent;

describe("an audit write the database refuses", () => {
  it("fails the delivery with the database cause so the outbox error names it", async () => {
    const instrumentation = mockInstrumentation();
    const repository = new DrizzleAuditLogRepository(instrumentation, mockPort<ILogger>());
    const recordAuditEntry = new RecordAuditEntryUseCase(
      repository,
      sha256AuditHasher,
      mockUnitOfWork().unitOfWork,
      { tamperEvidence: false },
    );
    const subscriber = new AuditEventSubscriber(recordAuditEntry, instrumentation);

    await expect(subscriber.handle(EVENT)).rejects.toThrow(`audit append failed: ${PG_CAUSE}`);
  });
});
