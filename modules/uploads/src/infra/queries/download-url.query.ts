import { Result } from "@packages/ddd-kit";
import type { UploadSettings } from "../../application/config/upload-settings";
import type {
  IStorageService,
  PresignedUrl,
  StorageError,
} from "../../application/ports/services/storage.port";
import type {
  DownloadUrlInput,
  IDownloadUrlQuery,
} from "../../application/queries/download-url.query";
import { authorizeDownload } from "../../application/services/upload-policy.service";

export class StorageDownloadUrlQuery implements IDownloadUrlQuery {
  constructor(
    private readonly storage: IStorageService,
    private readonly settings: UploadSettings,
  ) {}

  async execute(input: DownloadUrlInput): Promise<Result<PresignedUrl, StorageError>> {
    const request = authorizeDownload(input, this.settings);
    if (request.isFailure) return Result.fail(request.getError());

    return this.storage.presignDownload(request.getValue());
  }
}
