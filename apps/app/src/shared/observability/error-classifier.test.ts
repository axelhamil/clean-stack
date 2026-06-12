import { CancelledError } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { isUnexpectedError } from "./error-classifier";

function apiError(status: number): Error {
  return Object.assign(new Error(`http ${status}`), { status });
}

describe("isUnexpectedError", () => {
  it("captures 500", () => {
    expect(isUnexpectedError(apiError(500))).toBe(true);
  });

  it("captures 503", () => {
    expect(isUnexpectedError(apiError(503))).toBe(true);
  });

  it("skips expected 4xx statuses", () => {
    for (const status of [400, 401, 403, 404, 429]) {
      expect(isUnexpectedError(apiError(status))).toBe(false);
    }
  });

  it("captures network errors without status", () => {
    expect(isUnexpectedError(new TypeError("Failed to fetch"))).toBe(true);
  });

  it("captures thrown non-objects", () => {
    expect(isUnexpectedError("boom")).toBe(true);
  });

  it("skips AbortError", () => {
    const err = new Error("aborted");
    err.name = "AbortError";
    expect(isUnexpectedError(err)).toBe(false);
  });

  it("skips TanStack CancelledError", () => {
    expect(isUnexpectedError(new CancelledError())).toBe(false);
  });
});
