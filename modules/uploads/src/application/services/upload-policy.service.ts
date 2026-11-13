import { Result } from "@packages/ddd-kit";
import { z } from "zod";
import type { UploadSettings } from "../config/upload-settings";
import type { PresignDownloadInput, StorageError } from "../ports/services/storage.port";
import type { DownloadUrlInput } from "../queries/download-url.query";

export const keySchema = z
  .string()
  .min(1)
  .max(512)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._/-]*$/, "invalid key characters")
  .refine((v) => !v.includes(".."), "key must not contain .. segments")
  .refine((v) => !v.includes("//"), "key must not contain consecutive slashes");

export const NOT_OWNED: StorageError = {
  code: "STORAGE_FORBIDDEN",
  message: "key does not belong to the requesting owner",
};

export function isOwnedBy(key: string, ownerId: string): boolean {
  return key.startsWith(`${ownerId}/`);
}

export function clampTtl(seconds: number, settings: UploadSettings): number {
  return Math.min(Math.max(seconds, settings.presignTtlMinSeconds), settings.presignTtlMaxSeconds);
}

export function authorizeDownload(
  input: DownloadUrlInput,
  settings: UploadSettings,
): Result<PresignDownloadInput, StorageError> {
  if (!isOwnedBy(input.key, input.ownerId)) return Result.fail(NOT_OWNED);

  return Result.ok({
    key: input.key,
    expiresInSeconds: clampTtl(input.expiresInSeconds, settings),
  });
}

export async function hashKey(key: string): Promise<string> {
  const buf = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(key));

  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 16);
}
