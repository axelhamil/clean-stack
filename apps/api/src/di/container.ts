import { TransactionService } from "@packages/drizzle";
import { container } from "inwire";
import { logger } from "../../common/logger";
import { DrizzleGdprRepository } from "../adapters/repositories/drizzle-gdpr.repository";
import { ResendEmailService } from "../adapters/services/email.service";
import { S3StorageService } from "../adapters/services/storage.service";
import { GdprService } from "../application/services/gdpr.service";
import { UploadService } from "../application/services/upload.service";

export const di = container()
  // infra (ports)
  .add("IEmailService", () => new ResendEmailService())
  .add("IStorageService", () => new S3StorageService())
  .add("ITransactionService", () => new TransactionService())
  .add("IGdprRepository", () => new DrizzleGdprRepository(logger))
  // application services (orchestration of ports — no DDD aggregate yet)
  .add("UploadService", (c) => new UploadService(c.IStorageService))
  .add(
    "GdprService",
    (c) =>
      new GdprService(c.IGdprRepository, c.IStorageService, c.IEmailService, c.ITransactionService),
  )
  .build();

export type AppDeps = typeof di;
