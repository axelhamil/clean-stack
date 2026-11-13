import { describe, expect, it } from "bun:test";
import { encodeTimeIdCursor, timeIdCursorSchema } from "../time-id-cursor";

describe("time and id cursor", () => {
  it("round-trips a microsecond instant, which a Date would truncate and skip rows", () => {
    const at = "2026-10-30 16:41:00.816759";

    expect(timeIdCursorSchema.parse(encodeTimeIdCursor(at, "row-1"))).toEqual({ at, id: "row-1" });
  });

  it("keeps an id holding the separator", () => {
    expect(timeIdCursorSchema.parse(encodeTimeIdCursor("2026-01-01 10:00:00", "a~b")).id).toBe(
      "a~b",
    );
  });

  it("refuses what the list never issued", () => {
    expect(timeIdCursorSchema.safeParse("not-a-cursor").success).toBe(false);
    expect(timeIdCursorSchema.safeParse("2026-10-30T10:00:00.000Z").success).toBe(false);
  });
});
