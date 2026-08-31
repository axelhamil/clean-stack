import { mock } from "bun:test";
import { drizzleMock } from "./drizzle-mock";

mock.module("@packages/drizzle", drizzleMock);

import { describe, expect, test } from "bun:test";

const { buildPurgeFilter } = await import("../sweep-notifications.route");

function hasColumnName(obj: unknown, target: string, seen = new WeakSet<object>()): boolean {
  if (!obj || typeof obj !== "object") return false;
  if (seen.has(obj as object)) return false;
  seen.add(obj as object);
  if ((obj as Record<string, unknown>).name === target) return true;
  return Object.values(obj as object).some((v) =>
    Array.isArray(v)
      ? v.some((i) => hasColumnName(i, target, seen))
      : hasColumnName(v, target, seen),
  );
}

describe("sweep-notifications", () => {
  test("le filtre de purge exige une notification lue", () => {
    const filter = buildPurgeFilter(new Date("2026-01-01T00:00:00Z"));
    expect(hasColumnName(filter, "read_at")).toBe(true);
  });
});
