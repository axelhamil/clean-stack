import { describe, expect, test } from "bun:test";
import { db, sql } from "@packages/drizzle";
import { ensureNotificationTrigger } from "../notification-trigger";

describe("ensureNotificationTrigger", () => {
  test("est idempotent et installe le trigger", async () => {
    await ensureNotificationTrigger(db);
    await ensureNotificationTrigger(db);

    const rows = await db.execute(
      sql`SELECT tgname FROM pg_trigger WHERE tgname = 'notification_notify_trigger'`,
    );
    expect(rows.rows.length).toBe(1);
  });
});
