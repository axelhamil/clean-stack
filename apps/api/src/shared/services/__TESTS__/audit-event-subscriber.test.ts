import { describe, expect, it, mock } from "bun:test";
import { Option } from "@packages/ddd-kit";
import { env as realEnv } from "../../env";

mock.module("../../env", () => ({ env: { ...realEnv, AUDIT_TAMPER_EVIDENCE: true } }));

const { AuditEventSubscriber } = await import("../audit-event-subscriber");
const { computeAuditHash } = await import("../audit-hash");

const noopInstr = {
  startSpan: (_: unknown, fn: () => unknown) => fn(),
  capture: () => {},
  addBreadcrumb: () => {},
  setSpanAttributes: () => {},
};

function makeTx(lastHashRows: () => { hash: string | null }[]) {
  const captured: Record<string, unknown>[] = [];
  const insertChain = {
    values(v: Record<string, unknown>) {
      captured.push(v);
      return this;
    },
    onConflictDoNothing() {
      return this;
    },
    toSQL() {
      return { sql: "INSERT" };
    },
    execute: async () => undefined,
  };
  const selectChain = {
    from() {
      return this;
    },
    where() {
      return this;
    },
    orderBy() {
      return this;
    },
    limit() {
      return this;
    },
    execute: async () => lastHashRows(),
  };
  const tx = {
    execute: async () => undefined,
    insert: () => insertChain,
    select: () => selectChain,
  };
  return { tx, captured };
}

function event(id: string) {
  return {
    id,
    eventType: "billing.subscription.created",
    organizationId: Option.some("org-1"),
    aggregateType: "subscription",
    aggregateId: "sub-1",
    payload: { actorUserId: "op-1", foo: "bar" },
    metadata: { requestId: "req-1" },
    occurredAt: new Date("2026-07-10T00:00:00.000Z"),
  };
}

describe("AuditEventSubscriber hash chain", () => {
  it("genesis: first chained row has prevHash = GENESIS and a 64-char hash", async () => {
    const { tx, captured } = makeTx(() => []);
    const sub = new AuditEventSubscriber(noopInstr as never);
    await sub.handle(event("e1") as never, tx as never);
    expect(captured).toHaveLength(1);
    const row = captured[0];
    if (!row) throw new Error("expected a captured row");
    expect(row.prevHash).toBe("GENESIS");
    expect(typeof row.hash).toBe("string");
    expect((row.hash as string).length).toBe(64);
  });

  it("links: next row's prevHash equals the last stored hash", async () => {
    const { tx, captured } = makeTx(() => [{ hash: "abc123" }]);
    const sub = new AuditEventSubscriber(noopInstr as never);
    await sub.handle(event("e2") as never, tx as never);
    expect(captured).toHaveLength(1);
    const row = captured[0];
    if (!row) throw new Error("expected a captured row");
    expect(row.prevHash).toBe("abc123");
  });

  it("stores the hash verifyChain recomputes from the persisted row", async () => {
    const { tx, captured } = makeTx(() => []);
    await new AuditEventSubscriber(noopInstr as never).handle(event("e3") as never, tx as never);

    const row = captured[0];
    if (!row) throw new Error("expected a captured row");
    const recomputed = computeAuditHash({
      id: row.id as string,
      action: row.action as string,
      actorId: row.actorId as string | null,
      actorType: row.actorType as string,
      organizationId: row.organizationId as string | null,
      targetType: row.targetType as string,
      targetId: row.targetId as string,
      metadata: row.metadata,
      occurredAt: (row.occurredAt as Date).toISOString(),
      requestId: row.requestId as string | null,
      retention: row.retention as string,
      prevHash: row.prevHash as string,
    });

    expect(row.hash).toBe(recomputed);
  });
});

describe("AuditEventSubscriber actor", () => {
  const withPayload = (payload: Record<string, unknown>) => ({ ...event("e4"), payload });

  it("records the payload actor as a user", async () => {
    const { tx, captured } = makeTx(() => []);
    await new AuditEventSubscriber(noopInstr as never).handle(
      withPayload({ userId: "subject", inviterUserId: "inviter" }) as never,
      tx as never,
    );

    expect(captured[0]?.actorId).toBe("inviter");
    expect(captured[0]?.actorType).toBe("user");
  });

  it("falls back to a system actor when no actor key holds a user id", async () => {
    const { tx, captured } = makeTx(() => []);
    await new AuditEventSubscriber(noopInstr as never).handle(
      withPayload({ actorUserId: "", foo: "bar" }) as never,
      tx as never,
    );

    expect(captured[0]?.actorId).toBeNull();
    expect(captured[0]?.actorType).toBe("system");
  });
});
