import { describe, expect, it } from "bun:test";
import { computeAuditHash, GENESIS_HASH } from "../audit-hash";

describe("computeAuditHash", () => {
  const base = {
    id: "audit-1",
    action: "user.created",
    actorId: null,
    actorType: "system",
    organizationId: null,
    targetType: "user",
    targetId: "u1",
    metadata: { a: 1 },
    occurredAt: "2026-07-10T00:00:00.000Z",
    requestId: null,
    retention: "compliance",
    prevHash: GENESIS_HASH,
  };
  it("is deterministic", () => {
    expect(computeAuditHash(base)).toBe(computeAuditHash(base));
  });
  it("changes when any field changes (tamper)", () => {
    expect(computeAuditHash({ ...base, targetId: "u2" })).not.toBe(computeAuditHash(base));
  });
  it("is independent of metadata key order", () => {
    expect(computeAuditHash({ ...base, metadata: { a: 1, b: 2 } })).toBe(
      computeAuditHash({ ...base, metadata: { b: 2, a: 1 } }),
    );
  });
});
