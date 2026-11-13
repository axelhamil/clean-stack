import { describe, expect, it } from "bun:test";
import { Option, Result } from "@packages/ddd-kit";
import { EventTypes } from "@packages/events";
import { mockPort } from "@packages/test/bun";
import { mockUnitOfWork } from "@packages/test/bun/unit-of-work";
import { toAuditHashInput } from "../../../application/mappers/audit-hash-input.mapper";
import type {
  AuditError,
  AuditRecord,
  IAuditLogRepository,
} from "../../../application/ports/repositories/audit-log.port";
import type { RecordAuditEntryInput } from "../../../application/usecases/record-audit-entry/record-audit-entry.dto";
import { RecordAuditEntryUseCase } from "../../../application/usecases/record-audit-entry/record-audit-entry.usecase";
import { sha256AuditHasher } from "../../../infra/adapters/sha256-audit-hasher.adapter";

const FAILURE: AuditError = { code: "AUDIT_PERSISTENCE_PROVIDER_FAILURE", message: "db down" };

function event(over: Partial<RecordAuditEntryInput> = {}): RecordAuditEntryInput {
  return {
    eventId: "e1",
    eventType: EventTypes.BILLING_SUBSCRIPTION_CREATED,
    aggregateType: "subscription",
    aggregateId: "sub-1",
    organizationId: Option.some("org-1"),
    requestId: Option.some("req-1"),
    payload: { actorUserId: "op-1", foo: "bar" },
    occurredAt: new Date("2026-07-10T00:00:00.000Z"),
    ...over,
  };
}

function given({ lastHash = Option.none<string>(), tamperEvidence = true } = {}) {
  const repo = mockPort<IAuditLogRepository>();
  repo.lockChain.mockResolvedValue(Result.ok());
  repo.lastChainHash.mockResolvedValue(Result.ok(lastHash));
  repo.append.mockResolvedValue(Result.ok());
  const uow = mockUnitOfWork();
  const useCase = new RecordAuditEntryUseCase(repo, sha256AuditHasher, uow.unitOfWork, {
    tamperEvidence,
  });

  function appended(): AuditRecord[] {
    return repo.append.mock.calls.map(([record]) => record);
  }

  return { repo, uow, useCase, appended };
}

describe("record an audit entry", () => {
  it("keys the entry on the event id so a redelivery writes nothing twice", async () => {
    const { useCase, appended } = given();

    await useCase.execute(event());

    expect(appended().map(({ id }) => id)).toEqual(["audit-e1"]);
  });

  it("records the event as a row targeting its aggregate, inside a committed unit", async () => {
    const { useCase, uow, appended } = given();

    const result = await useCase.execute(event());

    expect(result.isSuccess).toBe(true);
    expect(uow.outcome()).toBe("committed");
    expect(appended()[0]).toMatchObject({
      action: EventTypes.BILLING_SUBSCRIPTION_CREATED,
      targetType: "subscription",
      targetId: "sub-1",
      retention: "compliance",
      metadata: { actorUserId: "op-1", foo: "bar" },
    });
    expect(appended()[0]?.organizationId.toNull()).toBe("org-1");
    expect(appended()[0]?.requestId.toNull()).toBe("req-1");
  });

  it("writes nothing for an event type whose retention is none", async () => {
    const { useCase, appended, uow } = given();

    const result = await useCase.execute(event({ eventType: "not.in.the.catalog" }));

    expect(result.isSuccess).toBe(true);
    expect(appended()).toEqual([]);
    expect(uow.outcome()).toBe("not_started");
  });

  it("starts the chain at GENESIS with a 64 character hash", async () => {
    const { useCase, appended } = given();

    await useCase.execute(event());

    expect(appended()[0]?.prevHash.toNull()).toBe("GENESIS");
    expect(appended()[0]?.hash.unwrapOr("")).toHaveLength(64);
  });

  it("links the entry to the last stored hash", async () => {
    const { useCase, appended } = given({ lastHash: Option.some("abc123") });

    await useCase.execute(event());

    expect(appended()[0]?.prevHash.toNull()).toBe("abc123");
  });

  it("stores the hash verifyChain recomputes from the persisted entry", async () => {
    const { useCase, appended } = given();

    await useCase.execute(event());

    const [record] = appended();
    if (!record) throw new Error("expected a recorded entry");
    const recomputed = sha256AuditHasher.hash(
      toAuditHashInput(record, record.prevHash.unwrapOr("")),
    );
    expect(record.hash.toNull()).toBe(recomputed);
  });

  it("leaves the hash columns empty when tamper evidence is off", async () => {
    const { useCase, appended } = given({ tamperEvidence: false });

    await useCase.execute(event());

    expect(appended()[0]?.prevHash.isNone()).toBe(true);
    expect(appended()[0]?.hash.isNone()).toBe(true);
  });

  it("records the payload actor as a user", async () => {
    const { useCase, appended } = given();

    await useCase.execute(event({ payload: { userId: "subject", inviterUserId: "inviter" } }));

    expect(appended()[0]?.actorId.toNull()).toBe("inviter");
    expect(appended()[0]?.actorType).toBe("user");
  });

  it("keeps a system actor when the payload declares a null actor beside its subject", async () => {
    const { useCase, appended } = given();

    await useCase.execute(event({ payload: { actorUserId: null, userId: "subject" } }));

    expect(appended()[0]?.actorId.toNull()).toBeNull();
    expect(appended()[0]?.actorType).toBe("system");
  });

  it("falls back to a system actor when no actor key holds a user id", async () => {
    const { useCase, appended } = given();

    await useCase.execute(event({ payload: { actorUserId: "", foo: "bar" } }));

    expect(appended()[0]?.actorId.toNull()).toBeNull();
    expect(appended()[0]?.actorType).toBe("system");
  });

  it("fails and rolls back when the last link cannot be read", async () => {
    const { useCase, repo, appended, uow } = given();
    repo.lastChainHash.mockResolvedValue(Result.fail(FAILURE));

    const result = await useCase.execute(event());

    expect(result.getError()).toEqual(FAILURE);
    expect(appended()).toEqual([]);
    expect(uow.outcome()).toBe("rolled_back");
  });

  it("fails and rolls back when the row cannot be written", async () => {
    const { useCase, repo, uow } = given();
    repo.append.mockResolvedValue(Result.fail(FAILURE));

    const result = await useCase.execute(event());

    expect(result.getError()).toEqual(FAILURE);
    expect(uow.outcome()).toBe("rolled_back");
  });
});
