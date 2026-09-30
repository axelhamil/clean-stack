import { describe, expect, test } from "bun:test";
import { DEFAULT_DIGEST_HOUR_UTC, digestDueAt } from "../digest-schedule";

const at = (iso: string) => new Date(iso);
const iso = (d: Date) => d.toISOString();

describe("digestDueAt", () => {
  test("immediate returns the event instant unchanged", () => {
    const occurred = at("2026-03-10T09:15:00.000Z");
    expect(digestDueAt(occurred, "immediate", 8)).toEqual(occurred);
  });

  test("hourly lands on the next full hour", () => {
    expect(iso(digestDueAt(at("2026-03-10T09:15:00.000Z"), "hourly", 8))).toBe(
      "2026-03-10T10:00:00.000Z",
    );
  });

  test("hourly crosses midnight without drifting", () => {
    expect(iso(digestDueAt(at("2026-03-10T23:59:59.999Z"), "hourly", 8))).toBe(
      "2026-03-11T00:00:00.000Z",
    );
  });

  test("daily targets today's anchor when the event precedes it", () => {
    expect(iso(digestDueAt(at("2026-03-10T06:30:00.000Z"), "daily", 8))).toBe(
      "2026-03-10T08:00:00.000Z",
    );
  });

  test("daily rolls over to tomorrow once the anchor has passed", () => {
    expect(iso(digestDueAt(at("2026-03-10T09:15:00.000Z"), "daily", 8))).toBe(
      "2026-03-11T08:00:00.000Z",
    );
  });

  // The boundary is the one case a "24 h after the last send" rule gets wrong in
  // both directions: an event landing exactly on the anchor either doubles up in
  // the digest that is being cut right now, or falls through it entirely.
  test("an event exactly on the anchor goes out with the next digest", () => {
    expect(iso(digestDueAt(at("2026-03-10T08:00:00.000Z"), "daily", 8))).toBe(
      "2026-03-11T08:00:00.000Z",
    );
    expect(iso(digestDueAt(at("2026-03-10T09:00:00.000Z"), "hourly", 8))).toBe(
      "2026-03-10T10:00:00.000Z",
    );
  });

  test("two events in the same window share exactly the same due date", () => {
    const first = digestDueAt(at("2026-03-10T08:00:01.000Z"), "daily", 8);
    const second = digestDueAt(at("2026-03-10T23:59:00.000Z"), "daily", 8);
    expect(iso(first)).toBe(iso(second));
  });

  test("the anchor is configurable and defaults to 08:00 UTC", () => {
    expect(iso(digestDueAt(at("2026-03-10T09:15:00.000Z"), "daily", 22))).toBe(
      "2026-03-10T22:00:00.000Z",
    );
    expect(iso(digestDueAt(at("2026-03-10T09:15:00.000Z"), "daily"))).toBe(
      iso(digestDueAt(at("2026-03-10T09:15:00.000Z"), "daily", DEFAULT_DIGEST_HOUR_UTC)),
    );
  });

  test("never mutates the given date", () => {
    const occurred = at("2026-03-10T09:15:00.000Z");
    digestDueAt(occurred, "daily", 8);
    digestDueAt(occurred, "hourly", 8);
    expect(iso(occurred)).toBe("2026-03-10T09:15:00.000Z");
  });
});
