import { afterEach, describe, expect, it, vi } from "vitest";
import { refuseForeignRows } from "../check-harness";

function refusal(found: number): { exited: boolean; message: string } {
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  const exit = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);

  refuseForeignRows("check-test", {
    found,
    rows: "claimable queue rows",
    clean: "delete from queue",
  });

  return {
    exited: exit.mock.calls.some(([code]) => code === 1),
    message: error.mock.calls.flat().join(" "),
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("refuseForeignRows", () => {
  it("lets the check run when the table holds no foreign row", () => {
    expect(refusal(0)).toEqual({ exited: false, message: "" });
  });

  it("stops the check and says what it found and how to clean it", () => {
    const { exited, message } = refusal(3);

    expect(exited).toBe(true);
    expect(message).toContain("check-test refuses to run");
    expect(message).toContain("3 claimable queue rows");
    expect(message).toContain("delete from queue");
    expect(message).toContain("fresh local database");
  });
});
