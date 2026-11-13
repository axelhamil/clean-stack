import type { EventHandler, IInstrumentation, IUnitOfWork } from "@packages/ddd-kit";
import type { IEmailService } from "@packages/email/email.port";
import { defineModule } from "inwire";
import type { ApiTokenSettings } from "./application/config/api-token-settings";
import { revokeTokensOnMembershipLost } from "./application/event-handlers/revoke-on-membership-lost";
import type { IApiTokenRepository } from "./application/ports/repositories/api-token.port";
import type { IGithubKeyVerifier } from "./application/ports/services/github-key-verifier.port";
import type { ITokenHasher } from "./application/ports/services/token-hasher.port";
import type { IUserContactReader } from "./application/ports/services/user-contact.port";
import type { IListApiTokensQuery } from "./application/queries/list-api-tokens.query";
import { ApiTokenService } from "./application/services/api-token.service";
import { CreateApiTokenUseCase } from "./application/usecases/create-api-token/create-api-token.usecase";
import { HandleLeakReportUseCase } from "./application/usecases/handle-leak-report/handle-leak-report.usecase";
import { RevokeAllUserTokensUseCase } from "./application/usecases/revoke-all-user-tokens/revoke-all-user-tokens.usecase";
import { RevokeApiTokenUseCase } from "./application/usecases/revoke-api-token/revoke-api-token.usecase";
import { RevokeMembershipTokensUseCase } from "./application/usecases/revoke-membership-tokens/revoke-membership-tokens.usecase";
import { cryptoTokenHasher } from "./infra/adapters/crypto-token-hasher.adapter";
import { GithubKeyVerifier } from "./infra/adapters/github-key-verifier.adapter";
import { DrizzleListApiTokensQuery } from "./infra/queries/list-api-tokens.query";
import { DrizzleApiTokenRepository } from "./infra/repos/drizzle/api-token.repository";

export interface ApiTokenPrerequisites {
  IInstrumentation: IInstrumentation;
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
    .add("ITokenHasher", (): ITokenHasher => cryptoTokenHasher)
    .add("IGithubKeyVerifier", (c): IGithubKeyVerifier => new GithubKeyVerifier(c.IInstrumentation))
    .add(
      "IListApiTokensQuery",
      (c): IListApiTokensQuery => new DrizzleListApiTokensQuery(c.IInstrumentation),
    )
    .add(
      "CreateApiTokenUseCase",
      (c) =>
        new CreateApiTokenUseCase(
          c.IApiTokenRepository,
          c.ITokenHasher,
          c.ITransactionService,
          c.IInstrumentation,
          c.apiTokenSettings,
        ),
    )
    .add(
      "RevokeApiTokenUseCase",
      (c) =>
        new RevokeApiTokenUseCase(c.IApiTokenRepository, c.ITransactionService, c.IInstrumentation),
    )
    .add("RevokeAllUserTokensUseCase", (c) => new RevokeAllUserTokensUseCase(c.IApiTokenRepository))
    .add(
      "RevokeMembershipTokensUseCase",
      (c) => new RevokeMembershipTokensUseCase(c.IApiTokenRepository, c.ITransactionService),
    )
    .add(
      "HandleLeakReportUseCase",
      (c) =>
        new HandleLeakReportUseCase(
          c.IApiTokenRepository,
          c.ITokenHasher,
          c.ITransactionService,
          c.IEmailService,
          c.IUserAccountStore,
          c.IInstrumentation,
          c.apiTokenSettings,
        ),
    )
    .add("ApiTokenService", (c) => new ApiTokenService(c.RevokeAllUserTokensUseCase))
    .add(
      "RevokeTokensOnMembershipLost",
      (c): EventHandler =>
        revokeTokensOnMembershipLost({
          RevokeMembershipTokensUseCase: c.RevokeMembershipTokensUseCase,
        }),
    ),
);
