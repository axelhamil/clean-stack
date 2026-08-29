import enCatalog from "@packages/i18n/src/catalogs/en";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), {
    error: vi.fn(),
    success: vi.fn(),
    dismiss: vi.fn(),
  }),
}));

vi.mock("../../i18n/get-errors-t", () => ({
  getErrorsT: () =>
    ((key: string, opts?: { defaultValue?: string }) => {
      const path = key.replace(/^errors:/, "").split(".");
      let node: unknown = enCatalog.errors;
      for (const seg of path) {
        if (typeof node !== "object" || node === null) return opts?.defaultValue ?? key;
        node = (node as Record<string, unknown>)[seg];
      }
      return typeof node === "string" ? node : (opts?.defaultValue ?? key);
    }) as never,
}));

import { toast } from "sonner";
import type { ApiError } from "./api-error";
import { toastError, toastSuccess } from "./toast";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("toastError", () => {
  it("skips 429 — rate-limit is surfaced once by the global query-error-handler", () => {
    const err: ApiError = Object.assign(new Error("Too many"), {
      status: 429,
      metadata: { retryAfter: 30 },
    });
    toastError(err, "fallback");
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("calls toast.error for non-429 ApiError with formatApiError copy", () => {
    const err: ApiError = Object.assign(new Error("original message"), {
      status: 400,
      code: "SOME_INVALID",
    });
    toastError(err, "fallback");
    expect(toast.error).toHaveBeenCalledOnce();
    expect(toast.error).toHaveBeenCalledWith("Invalid input.");
  });
});

describe("toastSuccess", () => {
  it("calls toast.success with the message", () => {
    toastSuccess("All done");
    expect(toast.success).toHaveBeenCalledWith("All done");
  });
});
