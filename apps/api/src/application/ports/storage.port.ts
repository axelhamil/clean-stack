import type { Result } from "@packages/ddd-kit";

export type StorageError =
  | { code: "STORAGE_FORBIDDEN"; message: string }
  | { code: "STORAGE_NOT_FOUND"; message: string }
  | { code: "STORAGE_INTEGRITY_FAILED"; message: string }
  | { code: "STORAGE_PROVIDER_FAILURE"; message: string };

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
