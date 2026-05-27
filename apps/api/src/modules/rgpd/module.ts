import { defineModule } from "inwire";
import { logger } from "../../shared/logger";
import type { IRgpdRepository } from "./application/ports/rgpd.port";
import { RgpdService } from "./application/services/rgpd.service";
import { DrizzleRgpdRepository } from "./infrastructure/repositories/drizzle-rgpd.repository";

declare module "inwire" {
  interface AppDeps {
    IRgpdRepository: IRgpdRepository;
    RgpdService: RgpdService;
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
        ),
    ),
);
