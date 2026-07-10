import { describe, expect, it } from "bun:test";
import { canonicalize, computeAuditHash, GENESIS_HASH } from "../audit-hash";

describe("canonicalize", () => {
  it("sorts keys regardless of insertion order", () => {
    expect(canonicalize({ b: 1, a: 2 })).toBe(canonicalize({ a: 2, b: 1 }));
  });
  it("is stable for nested objects and arrays", () => {
    expect(canonicalize({ x: { d: 1, c: 2 }, y: [3, { f: 4, e: 5 }] })).toBe(
      '{"x":{"c":2,"d":1},"y":[3,{"e":5,"f":4}]}',
    );
  });
  it("handles null and primitives", () => {
    expect(canonicalize(null)).toBe("null");
    expect(canonicalize("a")).toBe('"a"');
  });
});

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
