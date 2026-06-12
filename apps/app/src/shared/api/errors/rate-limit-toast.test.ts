import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), {
    error: vi.fn(),
    dismiss: vi.fn(),
  }),
}));

import { toast } from "sonner";
import { showRateLimitToast } from "./rate-limit-toast";

describe("showRateLimitToast", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows toast immediately with countdown description", () => {
    showRateLimitToast({ message: "Too many requests.", seconds: 5 });
    expect(toast.error).toHaveBeenCalledWith(
      "Too many requests.",
      expect.objectContaining({
        description: "Try again in 5s",
        duration: Number.POSITIVE_INFINITY,
      }),
    );
  });

  it("updates toast each second with decreasing count", () => {
    showRateLimitToast({ message: "Too many requests.", seconds: 3 });

    vi.advanceTimersByTime(1000);
    expect(toast.error).toHaveBeenCalledWith(
      "Too many requests.",
      expect.objectContaining({
        description: "Try again in 2s",
      }),
    );

    vi.advanceTimersByTime(1000);
    expect(toast.error).toHaveBeenCalledWith(
      "Too many requests.",
      expect.objectContaining({
        description: "Try again in 1s",
      }),
    );
  });

  it("dismisses the toast when countdown reaches zero", () => {
    showRateLimitToast({ message: "Too many requests.", seconds: 2 });

    vi.advanceTimersByTime(1000);
    expect(toast.dismiss).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1000);
    expect(toast.dismiss).toHaveBeenCalledOnce();
  });

  it("calls toast.error immediately when seconds is 0", () => {
    showRateLimitToast({ message: "Too many requests.", seconds: 0 });
    expect(toast.error).toHaveBeenCalledWith("Too many requests.");
    expect(toast.dismiss).not.toHaveBeenCalled();
  });

  it("stops the countdown when the toast is dismissed manually", () => {
    showRateLimitToast({ message: "Too many requests.", seconds: 5 });

    const onDismiss = (toast.error as ReturnType<typeof vi.fn>).mock.calls[0]?.[1]?.onDismiss as
      | (() => void)
      | undefined;
    expect(onDismiss).toBeDefined();
    onDismiss?.();

    const callsBefore = (toast.error as ReturnType<typeof vi.fn>).mock.calls.length;
    vi.advanceTimersByTime(3000);
    expect((toast.error as ReturnType<typeof vi.fn>).mock.calls.length).toBe(callsBefore);
  });

  it("uses stable id so sonner updates the same toast", () => {
    showRateLimitToast({ message: "Too many requests.", seconds: 2 });

    const firstId = (toast.error as ReturnType<typeof vi.fn>).mock.calls[0]?.[1]?.id as string;
    expect(firstId).toBeDefined();

    vi.advanceTimersByTime(1000);
    const secondId = (toast.error as ReturnType<typeof vi.fn>).mock.calls[1]?.[1]?.id as string;
    expect(secondId).toBe(firstId);
  });
});
