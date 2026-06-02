import { defineModule } from "inwire";
import { env } from "../../shared/env";
import type { IStorageService } from "../../shared/ports/storage.port";
import { UploadService } from "./application/services/upload.service";
import { NoOpStorageService } from "./infrastructure/services/noop-storage.service";
import { S3StorageService } from "./infrastructure/services/storage.service";
import { StorageHealthProbe } from "./infrastructure/storage-health-probe";

const storageConfigured = Boolean(env.S3_ENDPOINT && env.S3_ACCESS_KEY && env.S3_SECRET_KEY);

declare module "inwire" {
  interface AppDeps {
    IStorageService: IStorageService;
    UploadService: UploadService;
    StorageHealthProbe: StorageHealthProbe;
  }
}

export const uploadsModule = defineModule()((b) =>
  b
    .add(
      "IStorageService",
      (c): IStorageService =>
        storageConfigured ? new S3StorageService(c.IInstrumentation) : new NoOpStorageService(),
    )
    .add(
      "UploadService",
      (c) => new UploadService(c.IStorageService, c.IOutboxRepository, c.IInstrumentation),
    )
    .add(
      "StorageHealthProbe",
      (c) => new StorageHealthProbe(c.IHealthCheckRegistry, c.IStorageService),
    ),
);
