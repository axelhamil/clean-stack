import { Option, Result } from "@packages/ddd-kit";
import { logger } from "../../../../shared/logger";
import type {
  IStorageService,
  ObjectMetadata,
  PresignDownloadInput,
  PresignedUrl,
  PresignUploadInput,
  StorageError,
  UploadObjectInput,
} from "../../../../shared/ports/storage.port";
import { keySchema } from "../../application/dto/_key";

const unconfigured = <T>(): Promise<Result<T, StorageError>> =>
  Promise.resolve(
    Result.fail({
      code: "STORAGE_PROVIDER_FAILURE",
      message:
        "storage not configured: set S3_ENDPOINT, S3_ACCESS_KEY, S3_SECRET_KEY to enable uploads",
    }),
  );

export class NoOpStorageService implements IStorageService {
  constructor() {
    logger.warn(
      "S3 not configured — uploads disabled, storage operations will fail with STORAGE_PROVIDER_FAILURE",
    );
  }

  presignUpload(_input: PresignUploadInput): Promise<Result<PresignedUrl, StorageError>> {
    return unconfigured();
  }

  presignDownload(_input: PresignDownloadInput): Promise<Result<PresignedUrl, StorageError>> {
    return unconfigured();
  }

  headBucket(): Promise<Result<void, StorageError>> {
    return unconfigured();
  }

  headObject(_key: string): Promise<Result<ObjectMetadata, StorageError>> {
    return unconfigured();
  }

  deleteObject(_key: string): Promise<Result<void, StorageError>> {
    return unconfigured();
  }

  uploadObject(_input: UploadObjectInput): Promise<Result<void, StorageError>> {
    return unconfigured();
  }

  listObjectKeys(_prefix: string): Promise<Result<string[], StorageError>> {
    return unconfigured();
  }

  deleteObjects(_keys: string[]): Promise<Result<void, StorageError>> {
    return unconfigured();
  }

  publicUrlFor(key: string): string {
    return key;
  }

  keyFromPublicUrl(url: string): Option<string> {
    return keySchema.safeParse(url).success ? Option.some(url) : Option.none();
  }
}
