import { describe, expect, it } from "bun:test";
import { raceWithTimeout } from "../race-with-timeout";

const never = new Promise<string>(() => {});

describe("raceWithTimeout", () => {
  it("a work that settles in time wins over the fallback", async () => {
    expect(await raceWithTimeout(Promise.resolve("done"), 1_000, () => "late")).toBe("done");
  });

  it("a work slower than its budget yields the fallback", async () => {
    expect(await raceWithTimeout(never, 5, () => "late")).toBe("late");
  });

  it("a throwing fallback rejects the race", async () => {
    const raced = raceWithTimeout(never, 5, () => {
      throw new Error("timed out");
    });

    await expect(raced).rejects.toThrow("timed out");
  });
});
