import { toast } from "sonner";
import { formatApiError } from "./api/errors/messages";

export interface DisplayUser {
  name?: string | null;
  email: string;
}

export function displayName(user: DisplayUser): string {
  return user.name?.trim() || user.email;
}

export function formatDate(value: Date | string): string {
  return new Date(value).toLocaleDateString();
}

export function initialsOf(value: string): string {
  return (
    value
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((s) => s[0]?.toUpperCase() ?? "")
      .join("") ||
    value[0]?.toUpperCase() ||
    "?"
  );
}

function rawMessage(err: unknown): string | undefined {
  if (err instanceof Error) return err.message;
  if (
    typeof err === "object" &&
    err !== null &&
    "message" in err &&
    typeof (err as { message: unknown }).message === "string"
  ) {
    return (err as { message: string }).message;
  }
  return undefined;
}

export function toastError(err: unknown, fallback: string): void {
  toast.error(formatApiError(err, rawMessage(err) ?? fallback));
}
