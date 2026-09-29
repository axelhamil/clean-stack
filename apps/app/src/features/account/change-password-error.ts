import type { TFunction } from "i18next";
import type { ApiError } from "../../shared/api/errors/api-error";
import { formatApiError } from "../../shared/api/errors/messages";

type ChangePasswordField = "currentPassword" | "newPassword";

interface ChangePasswordFieldError {
  field: ChangePasswordField;
  message: string;
}

/**
 * BetterAuth rejects a wrong current password with `INVALID_PASSWORD`; every other
 * rejection (too short, too long, ...) is about the new one. Branching on the code
 * rather than on the English message keeps the error on the right field in every
 * locale, and the copy comes from the errors catalog instead of the raw server string.
 */
export function resolveChangePasswordError(
  error: unknown,
  fallback: string,
  tErrors: TFunction<"errors">,
): ChangePasswordFieldError {
  const code = (error as ApiError | undefined)?.code;
  const field = code === "INVALID_PASSWORD" ? "currentPassword" : "newPassword";

  return { field, message: formatApiError(error, fallback, tErrors) };
}
