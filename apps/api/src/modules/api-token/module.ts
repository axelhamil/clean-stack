import type { EventHandler } from "@packages/ddd-kit";
import { defineModule } from "inwire";
import { env } from "../../shared/env";
import { revokeTokensOnMembershipLost } from "./application/event-handlers/revoke-on-membership-lost";
import type { IApiTokenRepository } from "./application/ports/api-token.port";
import { ApiTokenService } from "./application/services/api-token.service";
import { DrizzleApiTokenRepository } from "./infrastructure/repositories/drizzle-api-token.repository";

declare module "inwire" {
  interface AppDeps {
    IApiTokenRepository: IApiTokenRepository;
    ApiTokenService: ApiTokenService;
    RevokeTokensOnMembershipLost: EventHandler;
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
    )
    .add("RevokeTokensOnMembershipLost", (c) =>
      revokeTokensOnMembershipLost({
        IApiTokenRepository: c.IApiTokenRepository,
        IOutboxRepository: c.IOutboxRepository,
        ITransactionService: c.ITransactionService,
        IInstrumentation: c.IInstrumentation,
      }),
    ),
);
