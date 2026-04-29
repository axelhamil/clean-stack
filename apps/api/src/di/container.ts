import { container } from "inwire";
import { ResendEmailService } from "../adapters/services/email.service";
import { S3StorageService } from "../adapters/services/storage.service";
import { ConfirmUploadUseCase } from "../application/use-cases/confirm-upload.use-case";
import { CreateDownloadUrlUseCase } from "../application/use-cases/create-download-url.use-case";
import { CreateUploadUrlUseCase } from "../application/use-cases/create-upload-url.use-case";

export const di = container()
  // infra
  .add("IEmailService", () => new ResendEmailService())
  .add("IStorageService", () => new S3StorageService())
  // uploads
  .add("CreateUploadUrlUseCase", (c) => new CreateUploadUrlUseCase(c.IStorageService))
  .add("ConfirmUploadUseCase", (c) => new ConfirmUploadUseCase(c.IStorageService))
  .add("CreateDownloadUrlUseCase", (c) => new CreateDownloadUrlUseCase(c.IStorageService))
  .build();

export type AppDeps = typeof di;
