import type { IInstrumentation, IUnitOfWork } from "@packages/ddd-kit";
import type { IEmailService } from "@packages/email/email.port";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import { defineModule } from "inwire";
import { logger } from "../../shared/logger";
import type { IStaffStore } from "../../shared/ports/staff-store.port";
import type { IStorageService } from "../../shared/ports/storage.port";
import type { ITotpVerifier } from "../../shared/ports/totp-verifier.port";
import type { RgpdSettings } from "./application/config/rgpd-settings";
import type { IRgpdRepository } from "./application/ports/rgpd.port";
import type { IStaffAccessRules } from "./application/ports/staff-access-rules.port";
import { RgpdService } from "./application/services/rgpd.service";
import { DrizzleRgpdRepository } from "./infrastructure/repositories/drizzle-rgpd.repository";

export interface RgpdPrerequisites {
  IInstrumentation: IInstrumentation;
  ITransactionService: IUnitOfWork;
  IOutboxRepository: IOutboxRepository;
  IEmailService: IEmailService;
  IStorageService: IStorageService;
  IStaffStore: IStaffStore;
  ITotpVerifier: ITotpVerifier;
  IStaffAccessRules: IStaffAccessRules;
  rgpdSettings: RgpdSettings;
}

export const rgpdModule = defineModule<RgpdPrerequisites>()((b) =>
  b
    .add(
      "IRgpdRepository",
      (c): IRgpdRepository => new DrizzleRgpdRepository(logger, c.IInstrumentation),
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
          logger,
        ),
    ),
);
