import type { IInstrumentation, ILogger } from "@packages/ddd-kit";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import { defineModule } from "inwire";
import type { StorageSettings, UploadSettings } from "./application/config/upload-settings";
import type { IHealthCheckRegistry } from "./application/ports/services/health.port";
import type { IStorageService } from "./application/ports/services/storage.port";
import type { IDownloadUrlQuery } from "./application/queries/download-url.query";
import { ConfirmUploadUseCase } from "./application/usecases/confirm-upload/confirm-upload.usecase";
import { CreateUploadUrlUseCase } from "./application/usecases/create-upload-url/create-upload-url.usecase";
import { DeleteUploadUseCase } from "./application/usecases/delete-upload/delete-upload.usecase";
import { NoOpStorageService } from "./infra/adapters/noop-storage.adapter";
import { S3StorageService } from "./infra/adapters/s3-storage.adapter";
import { StorageHealthProbe } from "./infra/adapters/storage-health-probe.adapter";
import { StorageDownloadUrlQuery } from "./infra/queries/download-url.query";

export interface UploadsPrerequisites {
  IInstrumentation: IInstrumentation;
  ILogger: ILogger;
  IOutboxRepository: IOutboxRepository;
  IHealthCheckRegistry: IHealthCheckRegistry;
  uploadSettings: UploadSettings;
  storageSettings: StorageSettings;
}

export const uploadsModule = defineModule<UploadsPrerequisites>()((b) =>
  b
    .add(
      "IStorageService",
      (c): IStorageService =>
        c.storageSettings.isSome()
          ? new S3StorageService(c.storageSettings.unwrap(), c.IInstrumentation, c.ILogger)
          : new NoOpStorageService(c.ILogger),
    )
    .add(
      "CreateUploadUrlUseCase",
      (c) => new CreateUploadUrlUseCase(c.IStorageService, c.IOutboxRepository, c.uploadSettings),
    )
    .add(
      "ConfirmUploadUseCase",
      (c) => new ConfirmUploadUseCase(c.IStorageService, c.IOutboxRepository),
    )
    .add(
      "DeleteUploadUseCase",
      (c) => new DeleteUploadUseCase(c.IStorageService, c.IOutboxRepository),
    )
    .add(
      "IDownloadUrlQuery",
      (c): IDownloadUrlQuery => new StorageDownloadUrlQuery(c.IStorageService, c.uploadSettings),
    )
    .add(
      "StorageHealthProbe",
      (c) => new StorageHealthProbe(c.IHealthCheckRegistry, c.IStorageService),
    ),
);
