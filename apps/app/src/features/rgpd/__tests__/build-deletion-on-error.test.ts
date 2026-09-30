import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildDeletionOnError } from "../build-deletion-on-error";

const toastError = vi.hoisted(() => vi.fn());
vi.mock("sonner", () => ({ toast: { error: toastError } }));

const tErrors = ((key: string, opts?: { defaultValue?: string }) =>
  opts?.defaultValue ?? key) as never;
const t = ((key: string) => key) as never;

function apiError(code: string) {
  return Object.assign(new Error(code), { code, status: 400 });
}

describe("buildDeletionOnError", () => {
  const onClose = vi.fn();
  const reportFieldError = vi.fn();
  const onError = buildDeletionOnError(
    onClose,
    "ACCOUNT_PASSWORD_INVALID",
    reportFieldError,
    tErrors,
    t,
  );

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reports a wrong credential on the field, with no toast", () => {
    onError(apiError("ACCOUNT_PASSWORD_INVALID"));

    expect(reportFieldError).toHaveBeenCalledWith("deletion.invalidCredential");
    expect(toastError).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("toasts and closes the dialog when the deletion is blocked", () => {
    onError(apiError("ACCOUNT_DELETION_BLOCKED"));

    expect(toastError).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
    expect(reportFieldError).not.toHaveBeenCalled();
  });

  it("toasts and keeps the dialog open on any other failure", () => {
    onError(new Error("network"));

    expect(toastError).toHaveBeenCalledWith("deletion.requestFailed");
    expect(onClose).not.toHaveBeenCalled();
  });
});
