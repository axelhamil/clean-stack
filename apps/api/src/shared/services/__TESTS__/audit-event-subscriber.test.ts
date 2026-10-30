import { beforeEach, describe, expect, it, mock } from "bun:test";
import * as realDrizzle from "@packages/drizzle";
import { mockUnitOfWork } from "@packages/test/bun/unit-of-work";
import { mockInstrumentation } from "../../../__TESTS__/mock-instrumentation";
import type { DeliveredEvent } from "../../ports/outbox.port";

type AuditRow = Record<string, unknown> & { id: string };

const stored: AuditRow[] = [];
let lastHash: string | null = null;

const executor = {
  execute: async () => undefined,
  select: () => {
    const chain = {
      from: () => chain,
      where: () => chain,
      orderBy: () => chain,
      limit: () => chain,
      execute: async () => (lastHash === null ? [] : [{ hash: lastHash }]),
    };
    return chain;
  },
  insert: () => {
    let row: AuditRow | undefined;
    let ignoreConflictOnId = false;
    const chain = {
      values(value: AuditRow) {
        row = value;
        return chain;
      },
      onConflictDoNothing(options: { target?: unknown }) {
        ignoreConflictOnId = options.target === realDrizzle.auditLogSchema.auditLog.id;
        return chain;
      },
      toSQL: () => ({ sql: "insert into audit_log" }),
      execute: async () => {
        if (!row) return;
        if (stored.some(({ id }) => id === row?.id)) {
          if (ignoreConflictOnId) return;
          throw new Error("duplicate key value violates unique constraint audit_log_pkey");
        }
        stored.push(row);
      },
    };
    return chain;
  },
};

mock.module("@packages/drizzle", () => ({ ...realDrizzle, resolveExecutor: () => executor }));

const { AuditEventSubscriber } = await import("../audit-event-subscriber");
const { computeAuditHash } = await import("../audit-hash");

function event(eventId: string, payload: unknown = { actorUserId: "op-1", foo: "bar" }) {
  return {
    eventId,
    eventType: "billing.subscription.created",
    organizationId: "org-1",
    aggregateType: "subscription",
    aggregateId: "sub-1",
    requestId: "req-1",
    payload,
    dateOccurred: new Date("2026-07-10T00:00:00.000Z"),
  } satisfies DeliveredEvent;
}

function handler(tamperEvidence = true) {
  return new AuditEventSubscriber(
    mockUnitOfWork().unitOfWork,
    mockInstrumentation(),
    tamperEvidence,
  );
}

beforeEach(() => {
  stored.length = 0;
  lastHash = null;
});

describe("AuditEventSubscriber", () => {
  it("audit-log is idempotent on redelivery (same eventId writes one row)", async () => {
    const audit = handler();

    await audit.handle(event("e1"));
    await audit.handle(event("e1"));

    expect(stored.map(({ id }) => id)).toEqual(["audit-e1"]);
  });

  it("genesis: first chained row has prevHash = GENESIS and a 64-char hash", async () => {
    await handler().handle(event("e1"));

    expect(stored[0]?.prevHash).toBe("GENESIS");
    expect(String(stored[0]?.hash)).toHaveLength(64);
  });

  it("links: next row's prevHash equals the last stored hash", async () => {
    lastHash = "abc123";

    await handler().handle(event("e2"));

    expect(stored[0]?.prevHash).toBe("abc123");
  });

  it("stores the hash verifyChain recomputes from the persisted row", async () => {
    await handler().handle(event("e3"));

    const row = stored[0];
    if (!row) throw new Error("expected a stored row");
    const recomputed = computeAuditHash({
      id: row.id,
      action: String(row.action),
      actorId: typeof row.actorId === "string" ? row.actorId : null,
      actorType: String(row.actorType),
      organizationId: typeof row.organizationId === "string" ? row.organizationId : null,
      targetType: String(row.targetType),
      targetId: String(row.targetId),
      metadata: row.metadata,
      occurredAt: row.occurredAt instanceof Date ? row.occurredAt.toISOString() : "",
      requestId: typeof row.requestId === "string" ? row.requestId : null,
      retention: String(row.retention),
      prevHash: String(row.prevHash),
    });

    expect(row).toMatchObject({ targetType: "subscription", requestId: "req-1" });
    expect(row.hash).toBe(recomputed);
  });

  it("records the payload actor as a user", async () => {
    await handler().handle(event("e4", { userId: "subject", inviterUserId: "inviter" }));

    expect(stored[0]).toMatchObject({ actorId: "inviter", actorType: "user" });
  });

  it("keeps a system actor when the payload declares a null actor beside its subject", async () => {
    await handler().handle(event("e5", { actorUserId: null, userId: "subject" }));

    expect(stored[0]).toMatchObject({ actorId: null, actorType: "system" });
  });

  it("falls back to a system actor when no actor key holds a user id", async () => {
    await handler().handle(event("e5", { actorUserId: "", foo: "bar" }));

    expect(stored[0]).toMatchObject({ actorId: null, actorType: "system" });
  });
});
