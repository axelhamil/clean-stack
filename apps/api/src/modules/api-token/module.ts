import { defineModule } from "inwire";
import { env } from "../../shared/env";
import type { IApiTokenRepository } from "./application/ports/api-token.port";
import { ApiTokenService } from "./application/services/api-token.service";
import { DrizzleApiTokenRepository } from "./infrastructure/repositories/drizzle-api-token.repository";

declare module "inwire" {
  interface AppDeps {
    IApiTokenRepository: IApiTokenRepository;
    ApiTokenService: ApiTokenService;
  }
}

export const apiTokenModule = defineModule()((b) =>
  b
    .add("IApiTokenRepository", (c) => new DrizzleApiTokenRepository(c.IInstrumentation))
    .add(
      "ApiTokenService",
      (c) =>
        new ApiTokenService(
          c.IApiTokenRepository,
          c.IOutboxRepository,
          c.ITransactionService,
          c.IInstrumentation,
          {
            prefix: env.API_TOKEN_PREFIX,
            pepper: env.API_TOKEN_PEPPER ?? "dev-only-pepper-not-for-production-use",
            maxExpiryDays: env.API_TOKEN_MAX_EXPIRY_DAYS,
            pepperVersion: env.API_TOKEN_PEPPER_VERSION,
          },
        ),
    ),
);
