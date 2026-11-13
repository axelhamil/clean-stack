import { afterEach, describe, expect, it, vi } from "vitest";
import { UUID, uuidv7 } from "../index";

class RecordingId extends UUID<string> {}

class ClipId extends UUID<string> {}

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("uuid", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("generates version 7 ids that sort in the order they were created", async () => {
    const first = uuidv7();
    await pause(5);
    const second = uuidv7();
    await pause(5);
    const third = new UUID<string>().value;

    expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect([third, first, second].sort()).toEqual([first, second, third]);
  });

  it("keeps ids generated in one millisecond strictly ascending and unique", () => {
    vi.spyOn(Date, "now").mockReturnValue(1_800_000_000_000);

    const ids = Array.from({ length: 1000 }, () => uuidv7());

    expect([...ids].sort()).toEqual(ids);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("stays ascending when the clock goes backwards", () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(1_900_000_000_000);
    const before = uuidv7();
    now.mockReturnValue(1_899_999_999_000);

    const after = uuidv7();

    expect(after > before).toBe(true);
  });

  it("is equal to an id of the same type holding the same value", () => {
    const id = new RecordingId("0199a000-0000-7000-8000-000000000001");

    expect(id.equals(new RecordingId("0199a000-0000-7000-8000-000000000001"))).toBe(true);
    expect(id.equals(new RecordingId("0199a000-0000-7000-8000-000000000002"))).toBe(false);
    expect(id.equals(undefined)).toBe(false);
  });

  it("is never equal to an id of another type, even with the same value", () => {
    const recordingId = new RecordingId("0199a000-0000-7000-8000-000000000001");
    const clipId = new ClipId("0199a000-0000-7000-8000-000000000001");

    expect(recordingId.equals(clipId)).toBe(false);
  });

  it("parses a uuid into the id type it is called on, trimmed and lowercased", () => {
    const parsed = RecordingId.parse("  0199A000-0000-7000-8000-000000000001 ");

    expect(parsed.getValue()).toBeInstanceOf(RecordingId);
    expect(parsed.getValue().value).toBe("0199a000-0000-7000-8000-000000000001");
  });

  it.each(["nope", "0199a000-0000-7000-8000-00000000000", "0199g000-0000-7000-8000-000000000001"])(
    "refuses %s, which is not a uuid, with a plain message",
    (raw) => {
      expect(RecordingId.parse(raw).getError()).toBe(`"${raw}" is not a uuid`);
    },
  );
});
