import type { Option } from "@packages/ddd-kit";

export interface UploadSettings {
  maxUploadBytes: number;
  presignTtlMinSeconds: number;
  presignTtlMaxSeconds: number;
}

export interface S3StorageSettings {
  endpoint: string;
  accessKey: string;
  secretKey: string;
  bucket: string;
  publicUrl: string;
  region: string;
  forcePathStyle: boolean;
  production: boolean;
}

export type StorageSettings = Option<S3StorageSettings>;
