import { describe, expect, mock, test } from "bun:test";

mock.module("../../../container", () => ({ di: {} }));

const { beatOfFlush } = await import("../flush-notification-emails.route");

describe("beatOfFlush", () => {
  test("records a real run with what it flushed", () => {
    const beat = beatOfFlush({ dryRun: false, skipped: false, flushed: 3 });

    expect(beat).toEqual({ outcome: "ok", count: 3 });
  });

  test("leaves the last real run in place when refused the lock or dry", () => {
    expect(beatOfFlush({ dryRun: false, skipped: true, flushed: 0 })).toBe(undefined);
    expect(beatOfFlush({ dryRun: true, flushed: 0 })).toBe(undefined);
  });
});
