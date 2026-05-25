import { defineModule } from "inwire";
import type { IStorageService } from "../../shared/ports/storage.port";
import { UploadService } from "./application/services/upload.service";
import { S3StorageService } from "./infrastructure/services/storage.service";
import { StorageHealthProbe } from "./infrastructure/storage-health-probe";

declare module "inwire" {
  interface AppDeps {
    IStorageService: IStorageService;
    UploadService: UploadService;
    StorageHealthProbe: StorageHealthProbe;
  }
}

export const uploadsModule = defineModule()((b) =>
  b
    .add("IStorageService", (): IStorageService => new S3StorageService())
    .add("UploadService", (c) => new UploadService(c.IStorageService, c.IOutboxRepository))
    .add(
      "StorageHealthProbe",
      (c) => new StorageHealthProbe(c.IHealthCheckRegistry, c.IStorageService),
    ),
);
