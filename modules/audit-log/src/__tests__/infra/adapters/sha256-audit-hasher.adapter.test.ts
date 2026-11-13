import { describe, expect, it } from "bun:test";
import { GENESIS_HASH } from "../../../application/ports/services/audit-hasher.port";
import { sha256AuditHasher } from "../../../infra/adapters/sha256-audit-hasher.adapter";

const computeAuditHash = sha256AuditHasher.hash;

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
  it("keeps the hash format stored rows were chained with", () => {
    expect(GENESIS_HASH).toBe("GENESIS");
    expect(computeAuditHash(base)).toBe(
      "d6dcf915c47def5563b4e0cb3f5453a78a77e0bd8055e091762327d6f6a9c165",
    );
  });
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
