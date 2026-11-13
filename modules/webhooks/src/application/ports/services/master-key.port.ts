import type { AppError, Option } from "@packages/ddd-kit";

export type MasterKeyProvider = () => Option<Uint8Array>;

export type MasterKeyUnavailable = AppError<"WEBHOOK_MASTER_KEY_UNAVAILABLE">;

export const MASTER_KEY_UNAVAILABLE: MasterKeyUnavailable = {
  code: "WEBHOOK_MASTER_KEY_UNAVAILABLE",
  message: "WEBHOOK_MASTER_KEY env var is not configured (64 hex chars)",
};
