import { describe, expect, test } from "bun:test";
import { db, outboxSchema } from "@packages/drizzle";
import { buildPurgeFilter } from "../sweep-outbox.route";

const renderWhere = (cutoff: Date) => {
  const event = outboxSchema.outboxEvent;
  return db.select({ id: event.id }).from(event).where(buildPurgeFilter(cutoff)).toSQL().sql;
};

describe("sweep-outbox", () => {
  test("the purge filter only targets delivered events older than the cutoff, never a dead undelivered one", () => {
    const where = renderWhere(new Date("2026-01-01T00:00:00Z"));

    expect(where).toContain('"outbox_event"."dispatched_at" is not null');
    expect(where).toContain('"outbox_event"."dispatched_at" <');
    expect(where).not.toContain("dead_at");
  });
});
