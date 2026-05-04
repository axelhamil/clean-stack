import { toast } from "sonner";

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

export function toastError(err: unknown, fallback: string): void {
  toast.error(err instanceof Error ? err.message : fallback);
}
