import type { AppError, Result } from "@packages/ddd-kit";

export type StorageError = AppError<
  | "STORAGE_FORBIDDEN"
  | "STORAGE_NOT_FOUND"
  | "STORAGE_INTEGRITY_FAILED"
  | "STORAGE_PROVIDER_FAILURE"
>;

export interface IExportStorage {
  uploadObject(input: {
    key: string;
    body: Uint8Array | string;
    contentType: string;
  }): Promise<Result<void, StorageError>>;

  presignDownload(input: {
    key: string;
    expiresInSeconds: number;
  }): Promise<Result<{ url: string; expiresAt: string }, StorageError>>;

  listObjectKeys(prefix: string): Promise<Result<string[], StorageError>>;

  deleteObjects(keys: string[]): Promise<Result<void, StorageError>>;
}
