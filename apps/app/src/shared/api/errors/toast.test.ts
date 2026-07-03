import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), {
    error: vi.fn(),
    success: vi.fn(),
    dismiss: vi.fn(),
  }),
}));

vi.mock("./rate-limit-toast", () => ({
  showRateLimitToast: vi.fn(),
}));

import { toast } from "sonner";
import type { ApiError } from "./api-error";
import { RATE_LIMITED_MESSAGE } from "./messages";
import { showRateLimitToast } from "./rate-limit-toast";
import { toastError, toastSuccess } from "./toast";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("toastError", () => {
  it("calls showRateLimitToast when status=429 and numeric retryAfter", () => {
    const err: ApiError = Object.assign(new Error("Too many"), {
      status: 429,
      metadata: { retryAfter: 30 },
    });
    toastError(err, "fallback");
    expect(showRateLimitToast).toHaveBeenCalledOnce();
    expect(showRateLimitToast).toHaveBeenCalledWith({ message: RATE_LIMITED_MESSAGE, seconds: 30 });
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("calls toast.error (not showRateLimitToast) when 429 but no retryAfter", () => {
    const err: ApiError = Object.assign(new Error("Too many"), {
      status: 429,
      metadata: {},
    });
    toastError(err, "fallback");
    expect(showRateLimitToast).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledOnce();
  });

  it("calls toast.error for non-429 ApiError with formatApiError copy", () => {
    const err: ApiError = Object.assign(new Error("original message"), {
      status: 400,
      code: "SOME_INVALID",
    });
    toastError(err, "fallback");
    expect(toast.error).toHaveBeenCalledOnce();
    expect(toast.error).toHaveBeenCalledWith("Invalid input.");
    expect(showRateLimitToast).not.toHaveBeenCalled();
  });
});

describe("toastSuccess", () => {
  it("calls toast.success with the message", () => {
    toastSuccess("All done");
    expect(toast.success).toHaveBeenCalledWith("All done");
  });
});
