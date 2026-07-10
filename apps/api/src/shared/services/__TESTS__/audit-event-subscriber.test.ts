import { describe, expect, it, mock } from "bun:test";
import { env as realEnv } from "../../env";

mock.module("../../env", () => ({ env: { ...realEnv, AUDIT_TAMPER_EVIDENCE: true } }));

const { AuditEventSubscriber } = await import("../audit-event-subscriber");

const noopInstr = {
  startSpan: (_: unknown, fn: () => unknown) => fn(),
  capture: () => {},
  addBreadcrumb: () => {},
};

function makeTx(lastHashRows: () => Array<{ hash: string | null }>) {
  const captured: Array<Record<string, unknown>> = [];
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
    organizationId: "org-1",
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
    expect(captured[0].prevHash).toBe("GENESIS");
    expect(typeof captured[0].hash).toBe("string");
    expect((captured[0].hash as string).length).toBe(64);
  });

  it("links: next row's prevHash equals the last stored hash", async () => {
    const { tx, captured } = makeTx(() => [{ hash: "abc123" }]);
    const sub = new AuditEventSubscriber(noopInstr as never);
    await sub.handle(event("e2") as never, tx as never);
    expect(captured[0].prevHash).toBe("abc123");
  });
});
