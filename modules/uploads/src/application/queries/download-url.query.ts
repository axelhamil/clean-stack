import type { IQuery } from "@packages/ddd-kit";
import type { PresignedUrl, StorageError } from "../ports/services/storage.port";

export interface DownloadUrlInput {
  ownerId: string;
  key: string;
  expiresInSeconds: number;
}

export type IDownloadUrlQuery = IQuery<DownloadUrlInput, PresignedUrl, StorageError>;
