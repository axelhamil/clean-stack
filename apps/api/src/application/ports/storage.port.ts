import type { AppError, Result } from "@packages/ddd-kit";

export type StorageError = AppError<
  | "STORAGE_FORBIDDEN"
  | "STORAGE_NOT_FOUND"
  | "STORAGE_INTEGRITY_FAILED"
  | "STORAGE_PROVIDER_FAILURE"
>;

export interface PresignUploadInput {
  key: string;
  contentType: string;
  size: number;
  expiresInSeconds: number;
}

export interface PresignDownloadInput {
  key: string;
  expiresInSeconds: number;
}

export interface PresignedUrl {
  url: string;
  expiresAt: string;
}

export interface ObjectMetadata {
  size: number;
  contentType: string;
}

export interface IStorageService {
  presignUpload(input: PresignUploadInput): Promise<Result<PresignedUrl, StorageError>>;

  presignDownload(input: PresignDownloadInput): Promise<Result<PresignedUrl, StorageError>>;

  headObject(key: string): Promise<Result<ObjectMetadata, StorageError>>;

  deleteObject(key: string): Promise<Result<void, StorageError>>;

  publicUrlFor(key: string): string;
}
