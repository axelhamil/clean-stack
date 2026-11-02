import { describe, expect, test } from "bun:test";
import {
  beatOfFlush,
  buildDigests,
  digestIdempotencyKey,
} from "../flush-notification-emails.route";

const row = (userId: string, category: string, id: string, locale: string | null = null) => ({
  id,
  userId,
  category,
  eventType: "billing.payment.failed",
  email: `${userId}@example.com`,
  locale,
  payload: {},
});

describe("buildDigests", () => {
  test("groups by user and by category", () => {
    const digests = buildDigests([
      row("u1", "billing", "n1"),
      row("u1", "billing", "n2"),
      row("u1", "org", "n3"),
      row("u2", "billing", "n4"),
    ]);

    expect(digests).toHaveLength(3);
    const billingU1 = digests.find((d) => d.userId === "u1" && d.category === "billing");
    expect(billingU1?.notificationIds).toEqual(["n1", "n2"]);
  });

  test("an empty batch produces no digest", () => {
    expect(buildDigests([])).toEqual([]);
  });

  test("keeps the recipient locale on the digest", () => {
    const digests = buildDigests([row("u1", "billing", "n1", "fr")]);
    expect(digests[0]?.locale).toBe("fr");
  });
});

describe("digestIdempotencyKey", () => {
  test("produces a fixed-length key whatever the number of ids", async () => {
    const key2 = await digestIdempotencyKey(["n1", "n2"]);
    const key500 = await digestIdempotencyKey(Array.from({ length: 500 }, (_, i) => `n${i}`));
    expect(key2).toHaveLength(64);
    expect(key500).toHaveLength(64);
  });
});

describe("beatOfFlush", () => {
  test("records a real run with what it flushed", () => {
    const beat = beatOfFlush({ dryRun: false, skipped: false, flushed: 3, notifications: 9 });

    expect(beat).toEqual({ outcome: "ok", count: 3 });
  });

  test("leaves the last real run in place when refused the lease or dry", () => {
    expect(beatOfFlush({ dryRun: false, skipped: true, flushed: 0, notifications: 0 })).toBe(
      undefined,
    );
    expect(beatOfFlush({ dryRun: true, flushed: 0, notifications: 0 })).toBe(undefined);
  });
});
