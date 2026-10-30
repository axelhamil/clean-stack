import { describe, expect, it, vi } from "vitest";
import { reportCaughtError } from "./report-caught-error";
import { captureError } from "./sentry";

vi.mock("./sentry", () => ({ captureError: vi.fn() }));

const BOUNDARY_INFO = { componentStack: "at Page" };

function apiError(status: number) {
  return Object.assign(new Error(`failed with ${status}`), { status });
}

describe("reportCaughtError", () => {
  it("given a rate limited route error, when a boundary catches it, then telemetry stays silent", () => {
    vi.mocked(captureError).mockClear();

    reportCaughtError(apiError(429), BOUNDARY_INFO);

    expect(captureError).not.toHaveBeenCalled();
  });

  it("given a server failure seen by both the router and React, when both report it, then it is captured once", () => {
    vi.mocked(captureError).mockClear();
    const error = apiError(503);

    reportCaughtError(error, BOUNDARY_INFO);
    reportCaughtError(error, BOUNDARY_INFO);

    expect(captureError).toHaveBeenCalledTimes(1);
    expect(captureError).toHaveBeenCalledWith(error, BOUNDARY_INFO);
  });
});
