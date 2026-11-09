import type { EventHandler, IInstrumentation, IUnitOfWork } from "@packages/ddd-kit";
import type { IEmailService } from "@packages/email/email.port";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import { defineModule } from "inwire";
import type { ApiTokenSettings } from "./application/config/api-token-settings";
import { revokeTokensOnMembershipLost } from "./application/event-handlers/revoke-on-membership-lost";
import type { IApiTokenRepository } from "./application/ports/api-token.port";
import type { IUserContactReader } from "./application/ports/user-contact.port";
import { ApiTokenService } from "./application/services/api-token.service";
import { TokenLeakService } from "./application/services/token-leak.service";
import { DrizzleApiTokenRepository } from "./infrastructure/repositories/drizzle-api-token.repository";
import { GithubKeyVerifier } from "./infrastructure/services/github-key-verifier";

export interface ApiTokenPrerequisites {
  IInstrumentation: IInstrumentation;
  IOutboxRepository: IOutboxRepository;
  ITransactionService: IUnitOfWork;
  IEmailService: IEmailService;
  IUserAccountStore: IUserContactReader;
  apiTokenSettings: ApiTokenSettings;
}

export const apiTokenModule = defineModule<ApiTokenPrerequisites>()((b) =>
  b
    .add(
      "IApiTokenRepository",
      (c): IApiTokenRepository => new DrizzleApiTokenRepository(c.IInstrumentation),
    )
    .add("GithubKeyVerifier", (c) => new GithubKeyVerifier(c.IInstrumentation))
    .add(
      "ApiTokenService",
      (c) =>
        new ApiTokenService(
          c.IApiTokenRepository,
          c.IOutboxRepository,
          c.ITransactionService,
          c.IInstrumentation,
          c.apiTokenSettings,
        ),
    )
    .add(
      "TokenLeakService",
      (c) =>
        new TokenLeakService(
          c.IApiTokenRepository,
          c.IOutboxRepository,
          c.ITransactionService,
          c.IEmailService,
          c.IUserAccountStore,
          c.IInstrumentation,
          c.apiTokenSettings,
        ),
    )
    .add(
      "RevokeTokensOnMembershipLost",
      (c): EventHandler =>
        revokeTokensOnMembershipLost({
          IApiTokenRepository: c.IApiTokenRepository,
          IOutboxRepository: c.IOutboxRepository,
          ITransactionService: c.ITransactionService,
        }),
    ),
);
