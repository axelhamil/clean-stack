import type { IInstrumentation, ILogger, IUnitOfWork } from "@packages/ddd-kit";
import type { IEmailService } from "@packages/email/email.port";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import { defineModule } from "inwire";
import type { RgpdSettings } from "./application/config/rgpd-settings";
import type { IApiTokenRevoker } from "./application/ports/api-token-revoker.port";
import type { IEndedSessionsReader } from "./application/ports/ended-sessions.port";
import type { IExportStorage } from "./application/ports/export-storage.port";
import type { IRgpdRepository } from "./application/ports/rgpd.port";
import type { IStaffAccessRules } from "./application/ports/staff-access-rules.port";
import type { IStaffDataEraser } from "./application/ports/staff-data-eraser.port";
import type { IStaffStore } from "./application/ports/staff-store.port";
import type { ITotpVerifier } from "./application/ports/totp-verifier.port";
import { RgpdService } from "./application/services/rgpd.service";
import { DrizzleRgpdRepository } from "./infrastructure/repositories/drizzle-rgpd.repository";

export interface RgpdPrerequisites {
  IInstrumentation: IInstrumentation;
  ILogger: ILogger;
  ITransactionService: IUnitOfWork;
  IOutboxRepository: IOutboxRepository;
  IEmailService: IEmailService;
  IStorageService: IExportStorage;
  IStaffStore: IStaffStore;
  ITotpVerifier: ITotpVerifier;
  IStaffAccessRules: IStaffAccessRules;
  IApiTokenRevoker: IApiTokenRevoker;
  IStaffDataEraser: IStaffDataEraser;
  IEndedSessionsReader: IEndedSessionsReader;
  rgpdSettings: RgpdSettings;
}

export const rgpdModule = defineModule<RgpdPrerequisites>()((b) =>
  b
    .add(
      "IRgpdRepository",
      (c): IRgpdRepository =>
        new DrizzleRgpdRepository(
          c.ILogger,
          c.IInstrumentation,
          c.IApiTokenRevoker,
          c.IStaffDataEraser,
          c.IEndedSessionsReader,
        ),
    )
    .add(
      "RgpdService",
      (c) =>
        new RgpdService(
          c.IRgpdRepository,
          c.IStorageService,
          c.IEmailService,
          c.ITransactionService,
          c.IOutboxRepository,
          c.IInstrumentation,
          c.IStaffStore,
          c.IStaffAccessRules,
          c.ITotpVerifier,
          c.rgpdSettings,
          c.ILogger,
        ),
    ),
);
