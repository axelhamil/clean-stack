import { defineModule } from "inwire";
import { env } from "../../shared/env";
import { logger } from "../../shared/logger";
import type { IStorageService } from "../../shared/ports/storage.port";
import type { IRgpdRepository } from "./application/ports/rgpd.port";
import { RgpdService } from "./application/services/rgpd.service";
import { DrizzleRgpdRepository } from "./infrastructure/repositories/drizzle-rgpd.repository";

declare module "inwire" {
  interface AppDeps {
    IRgpdRepository: IRgpdRepository;
    RgpdService: RgpdService;
    IStorageService: IStorageService;
  }
}

export const rgpdModule = defineModule()((b) =>
  b
    .add("IRgpdRepository", (c) => new DrizzleRgpdRepository(logger, c.IInstrumentation))
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
          env,
          c.ITotpVerifier,
          {
            appUrl: env.APP_URL,
            gracePeriodDays: env.RGPD_GRACE_PERIOD_DAYS,
            exportRateLimitHours: env.RGPD_EXPORT_RATE_LIMIT_HOURS,
            sweepDeadlineMs: env.SWEEP_DEADLINE_MS,
          },
          logger,
        ),
    ),
);
