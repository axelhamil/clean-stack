import { CancelledError } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { isUnexpectedError, isUnexpectedMutationError } from "./error-classifier";

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

  it("captures thrown null", () => {
    expect(isUnexpectedError(null)).toBe(true);
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

describe("isUnexpectedMutationError", () => {
  it("captures 5xx api errors", () => {
    expect(isUnexpectedMutationError(apiError(503))).toBe(true);
  });

  it("skips expected 4xx api errors", () => {
    expect(isUnexpectedMutationError(apiError(429))).toBe(false);
  });

  it("captures network TypeError", () => {
    expect(isUnexpectedMutationError(new TypeError("Failed to fetch"))).toBe(true);
  });

  it("skips plain Error without status (flow-control signals)", () => {
    expect(isUnexpectedMutationError(new Error("Cancelled"))).toBe(false);
    expect(isUnexpectedMutationError(new Error("EMAIL_NOT_VERIFIED_REDIRECT"))).toBe(false);
  });

  it("skips AbortError and CancelledError", () => {
    const aborted = new Error("aborted");
    aborted.name = "AbortError";
    expect(isUnexpectedMutationError(aborted)).toBe(false);
    expect(isUnexpectedMutationError(new CancelledError())).toBe(false);
  });
});
