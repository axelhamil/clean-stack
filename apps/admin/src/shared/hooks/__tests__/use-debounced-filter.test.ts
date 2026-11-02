import { describe, expect, it } from "vitest";
import { isOwnCommitEcho } from "../use-debounced-filter";

describe("isOwnCommitEcho", () => {
  it("keeps the keystrokes typed since when the value coming back is the one just committed", () => {
    expect(isOwnCommitEcho("ab", "ab")).toBe(true);
  });

  it("takes the new value when it came from elsewhere, like a back navigation", () => {
    expect(isOwnCommitEcho("", "ab")).toBe(false);
  });
});
