import { describe, expect, test } from "bun:test";
import { db, notificationSchema } from "@packages/drizzle";
import { buildPurgeFilter } from "../sweep-notifications.route";

// Rendered through the real query builder (nothing is replaced in this file), so the
// SQL below is what Postgres would receive, not a marker a stand-in produced.
const renderWhere = (cutoff: Date) => {
  const n = notificationSchema.notification;
  return db.select({ id: n.id }).from(n).where(buildPurgeFilter(cutoff)).toSQL().sql;
};

describe("sweep-notifications", () => {
  test("the purge filter only targets notifications that were read", () => {
    expect(renderWhere(new Date("2026-01-01T00:00:00Z"))).toContain(
      '"notification"."read_at" is not null',
    );
  });

  test("the purge filter bounds the rows by their creation date", () => {
    expect(renderWhere(new Date("2026-01-01T00:00:00Z"))).toContain(
      '"notification"."created_at" <',
    );
  });
});
