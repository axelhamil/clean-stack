import type { IInstrumentation, ILogger, IUnitOfWork } from "@packages/ddd-kit";
import type { IEmailService } from "@packages/email/email.port";
import type { ISweepRunStore } from "@packages/http/sweep-run.port";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import { defineModule } from "inwire";
import type { RgpdSettings } from "./application/config/rgpd-settings";
import type { IAccountEraser } from "./application/ports/repositories/account-eraser.port";
import type { IDeletionStateRepository } from "./application/ports/repositories/deletion-state.port";
import type { IUserDataExportReader } from "./application/ports/repositories/user-data-export.port";
import type { IApiTokenRevoker } from "./application/ports/services/api-token-revoker.port";
import type { IDeletionSweepHeartbeat } from "./application/ports/services/deletion-sweep-heartbeat.port";
import type { IEndedSessionsReader } from "./application/ports/services/ended-sessions.port";
import type { IExportStorage } from "./application/ports/services/export-storage.port";
import type { IPasswordVerifier } from "./application/ports/services/password-verifier.port";
import type { IStaffAccessRules } from "./application/ports/services/staff-access-rules.port";
import type { IStaffDataEraser } from "./application/ports/services/staff-data-eraser.port";
import type { IStaffStore } from "./application/ports/services/staff-store.port";
import type { ITotpVerifier } from "./application/ports/services/totp-verifier.port";
import type { IPreflightAccountDeletionQuery } from "./application/queries/preflight-account-deletion.query";
import { AccountWipeService } from "./application/services/account-wipe.service";
import { CancelAccountDeletionUseCase } from "./application/usecases/cancel-account-deletion/cancel-account-deletion.usecase";
import { ExecuteAccountWipeUseCase } from "./application/usecases/execute-account-wipe/execute-account-wipe.usecase";
import { ProcessPendingDeletionsUseCase } from "./application/usecases/process-pending-deletions/process-pending-deletions.usecase";
import { RequestAccountDeletionUseCase } from "./application/usecases/request-account-deletion/request-account-deletion.usecase";
import { RequestDataExportUseCase } from "./application/usecases/request-data-export/request-data-export.usecase";
import { CredentialPasswordVerifier } from "./infra/adapters/credential-password-verifier.adapter";
import { DeletionSweepHeartbeat } from "./infra/adapters/deletion-sweep-heartbeat.adapter";
import { DrizzlePreflightAccountDeletionQuery } from "./infra/queries/preflight-account-deletion.query";
import { DrizzleAccountEraser } from "./infra/repos/drizzle/account-eraser.repository";
import { DrizzleDeletionStateRepository } from "./infra/repos/drizzle/deletion-state.repository";
import { DrizzleUserDataExportReader } from "./infra/repos/drizzle/user-data-export.repository";

export interface RgpdPrerequisites {
  IInstrumentation: IInstrumentation;
  ILogger: ILogger;
  ITransactionService: IUnitOfWork;
  IOutboxRepository: IOutboxRepository;
  IEmailService: IEmailService;
  IStorageService: IExportStorage;
  ISweepRunStore: ISweepRunStore;
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
      "IDeletionStateRepository",
      (c): IDeletionStateRepository =>
        new DrizzleDeletionStateRepository(c.ILogger, c.IInstrumentation),
    )
    .add(
      "IAccountEraser",
      (c): IAccountEraser => new DrizzleAccountEraser(c.ILogger, c.IInstrumentation),
    )
    .add(
      "IUserDataExportReader",
      (c): IUserDataExportReader => new DrizzleUserDataExportReader(c.ILogger, c.IInstrumentation),
    )
    .add(
      "IPasswordVerifier",
      (c): IPasswordVerifier => new CredentialPasswordVerifier(c.ILogger, c.IInstrumentation),
    )
    .add(
      "IPreflightAccountDeletionQuery",
      (c): IPreflightAccountDeletionQuery =>
        new DrizzlePreflightAccountDeletionQuery(c.ILogger, c.IInstrumentation),
    )
    .add(
      "IDeletionSweepHeartbeat",
      (c): IDeletionSweepHeartbeat =>
        new DeletionSweepHeartbeat(c.ISweepRunStore, c.IInstrumentation),
    )
    .add(
      "AccountWipeService",
      (c) =>
        new AccountWipeService({
          states: c.IDeletionStateRepository,
          eraser: c.IAccountEraser,
          staffData: c.IStaffDataEraser,
          apiTokens: c.IApiTokenRevoker,
          endedSessions: c.IEndedSessionsReader,
          staff: c.IStaffStore,
          staffAccess: c.IStaffAccessRules,
          storage: c.IStorageService,
          email: c.IEmailService,
          transactions: c.ITransactionService,
          outbox: c.IOutboxRepository,
          instrumentation: c.IInstrumentation,
          logger: c.ILogger,
        }),
    )
    .add(
      "RequestAccountDeletionUseCase",
      (c) =>
        new RequestAccountDeletionUseCase({
          states: c.IDeletionStateRepository,
          preflight: c.IPreflightAccountDeletionQuery,
          totp: c.ITotpVerifier,
          passwords: c.IPasswordVerifier,
          staff: c.IStaffStore,
          staffAccess: c.IStaffAccessRules,
          email: c.IEmailService,
          transactions: c.ITransactionService,
          outbox: c.IOutboxRepository,
          settings: c.rgpdSettings,
          logger: c.ILogger,
        }),
    )
    .add(
      "CancelAccountDeletionUseCase",
      (c) =>
        new CancelAccountDeletionUseCase(
          c.IDeletionStateRepository,
          c.IEmailService,
          c.ITransactionService,
          c.IOutboxRepository,
          c.ILogger,
        ),
    )
    .add("ExecuteAccountWipeUseCase", (c) => new ExecuteAccountWipeUseCase(c.AccountWipeService))
    .add(
      "ProcessPendingDeletionsUseCase",
      (c) =>
        new ProcessPendingDeletionsUseCase(
          c.IDeletionStateRepository,
          c.AccountWipeService,
          c.IDeletionSweepHeartbeat,
          c.rgpdSettings,
          c.ILogger,
        ),
    )
    .add(
      "RequestDataExportUseCase",
      (c) =>
        new RequestDataExportUseCase({
          states: c.IDeletionStateRepository,
          exports: c.IUserDataExportReader,
          storage: c.IStorageService,
          email: c.IEmailService,
          transactions: c.ITransactionService,
          outbox: c.IOutboxRepository,
          settings: c.rgpdSettings,
          logger: c.ILogger,
        }),
    ),
);
