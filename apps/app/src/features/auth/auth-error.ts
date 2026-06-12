import { RATE_LIMITED_MESSAGE } from "../../shared/api/errors/messages";

interface BetterAuthError {
  status?: number;
  message?: string;
  code?: string;
}

export function resolveAuthError(error: BetterAuthError, fallback: string): string {
  if (error.status === 429) return RATE_LIMITED_MESSAGE;
  return error.message ?? fallback;
}
