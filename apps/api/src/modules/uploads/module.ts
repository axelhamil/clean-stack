import type { IInstrumentation } from "@packages/ddd-kit";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import { defineModule } from "inwire";
import type { IHealthCheckRegistry } from "../../shared/ports/health.port";
import type { IStorageService } from "../../shared/ports/storage.port";
import type { StorageSettings, UploadSettings } from "./application/config/upload-settings";
import { UploadService } from "./application/services/upload.service";
import { NoOpStorageService } from "./infrastructure/services/noop-storage.service";
import { S3StorageService } from "./infrastructure/services/storage.service";
import { StorageHealthProbe } from "./infrastructure/storage-health-probe";

export interface UploadsPrerequisites {
  IInstrumentation: IInstrumentation;
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
          ? new S3StorageService(c.storageSettings.unwrap(), c.IInstrumentation)
          : new NoOpStorageService(),
    )
    .add(
      "UploadService",
      (c) =>
        new UploadService(
          c.IStorageService,
          c.IOutboxRepository,
          c.IInstrumentation,
          c.uploadSettings,
        ),
    )
    .add(
      "StorageHealthProbe",
      (c) => new StorageHealthProbe(c.IHealthCheckRegistry, c.IStorageService),
    ),
);
