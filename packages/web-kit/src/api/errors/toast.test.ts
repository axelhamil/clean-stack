import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), {
    error: vi.fn(),
    success: vi.fn(),
    dismiss: vi.fn(),
  }),
}));

vi.mock("../../i18n/get-errors-t", async () => {
  const { catalogT } = await import("../../i18n/__tests__/catalog-t");
  const { default: enCatalog } = await import("@packages/i18n/src/catalogs/en");
  return { getErrorsT: () => catalogT(enCatalog.errors) };
});

import { toast } from "sonner";
import type { ApiError } from "./api-error";
import { toastError, toastSuccess } from "./toast";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("toastError", () => {
  it("skips 429, the rate limit is surfaced once by the global query-error-handler", () => {
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

  it("prefers the caller's localised fallback over the untranslated server message", () => {
    const err: ApiError = Object.assign(new Error("Something exploded server-side"), {
      status: 500,
    });
    toastError(err, "Impossible de mettre à jour votre langue");
    expect(toast.error).toHaveBeenCalledWith("Impossible de mettre à jour votre langue");
  });
});

describe("toastSuccess", () => {
  it("calls toast.success with the message", () => {
    toastSuccess("All done");
    expect(toast.success).toHaveBeenCalledWith("All done");
  });
});
