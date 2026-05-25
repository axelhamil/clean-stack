import { type IUnitOfWork, Result } from "@packages/ddd-kit";
import { EventTypes } from "@packages/events";
import { env } from "../../../../shared/env";
import { emitEvent } from "../../../../shared/event-emitter";
import { logger } from "../../../../shared/logger";
import type { IEmailService } from "../../../../shared/ports/email.port";
import type { IOutboxRepository } from "../../../../shared/ports/outbox.port";
import type { IStorageService, StorageError } from "../../../../shared/ports/storage.port";
import type { ITransaction } from "../../../../shared/transaction";
import type {
  ExecuteWipeOutput,
  IRgpdRepository,
  RgpdError,
  SoleOwnedOrgWithMembers,
} from "../ports/rgpd.port";

const EXPORT_DOWNLOAD_TTL_SECONDS = 7 * 24 * 60 * 60;

export interface PreflightAccountDeletionInput {
  userId: string;
}
export interface PreflightAccountDeletionOutput {
  blockingOrgs: SoleOwnedOrgWithMembers[];
}

export interface RequestAccountDeletionInput {
  userId: string;
  totpCode?: string;
  password?: string;
}
export interface RequestAccountDeletionOutput {
  pendingDeletionUntil: string;
}

export interface CancelAccountDeletionInput {
  userId: string;
}
export interface CancelAccountDeletionOutput {
  ok: true;
}

export interface ExecuteAccountWipeInput {
  userId: string;
}
export interface ExecuteAccountWipeOutput {
  deletedOrgIds: string[];
  storageKeysDeleted: number;
}

export interface ProcessPendingDeletionsInput {
  batchSize?: number;
  dryRun?: boolean;
}
export interface ProcessPendingDeletionsOutput {
  processed: number;
  succeeded: string[];
  failed: Array<{ userId: string; errorCode: string }>;
  dryRun: boolean;
}

export interface RequestDataExportInput {
  userId: string;
}
export interface RequestDataExportOutput {
  ok: true;
  expiresAt: string;
}

export class RgpdService {
  constructor(
    private readonly rgpd: IRgpdRepository,
    private readonly storage: IStorageService,
    private readonly email: IEmailService,
    private readonly transactions: IUnitOfWork<ITransaction>,
    private readonly outbox: IOutboxRepository,
  ) {}

  async preflightAccountDeletion(
    input: PreflightAccountDeletionInput,
  ): Promise<Result<PreflightAccountDeletionOutput, RgpdError>> {
    const blockingResult = await this.rgpd.findSoleOwnedNonPersonalOrgsWithMembers(input.userId);
    if (blockingResult.isFailure) return Result.fail(blockingResult.getError());
    return Result.ok({ blockingOrgs: blockingResult.getValue() });
  }

  async requestAccountDeletion(
    input: RequestAccountDeletionInput,
  ): Promise<Result<RequestAccountDeletionOutput, RgpdError>> {
    const stateResult = await this.rgpd.getUserDeletionState(input.userId);
    if (stateResult.isFailure) return Result.fail(stateResult.getError());
    const stateOpt = stateResult.getValue();
    if (stateOpt.isNone())
      return Result.fail({ code: "ACCOUNT_DELETION_NOT_FOUND", message: "user not found" });

    const state = stateOpt.unwrap();

    if (state.pendingDeletionUntil.isSome())
      return Result.ok({ pendingDeletionUntil: state.pendingDeletionUntil.unwrap().toISOString() });

    const blockingResult = await this.rgpd.findSoleOwnedNonPersonalOrgsWithMembers(input.userId);
    if (blockingResult.isFailure) return Result.fail(blockingResult.getError());
    const blocking = blockingResult.getValue();
    if (blocking.length > 0)
      return Result.fail({
        code: "ACCOUNT_DELETION_BLOCKED",
        message: "transfer ownership or delete the listed organizations before account deletion",
        metadata: { offendingOrgs: blocking },
      });

    if (state.twoFactorEnabled) {
      if (!input.totpCode)
        return Result.fail({
          code: "TWO_FACTOR_REQUIRED",
          message: "two-factor TOTP code required",
        });

      const totpResult = await this.rgpd.verifyTotp(input.userId, input.totpCode);
      if (totpResult.isFailure) return Result.fail(totpResult.getError());
      if (!totpResult.getValue())
        return Result.fail({ code: "TWO_FACTOR_INVALID", message: "invalid TOTP code" });
    } else {
      if (!input.password)
        return Result.fail({
          code: "ACCOUNT_PASSWORD_REQUIRED",
          message: "password required to confirm deletion",
        });

      const pwdResult = await this.rgpd.verifyPassword(input.userId, input.password);
      if (pwdResult.isFailure) return Result.fail(pwdResult.getError());
      if (!pwdResult.getValue())
        return Result.fail({ code: "ACCOUNT_PASSWORD_INVALID", message: "invalid password" });
    }

    const until = new Date(Date.now() + (env.RGPD_GRACE_PERIOD_DAYS ?? 7) * 24 * 60 * 60 * 1000);
    const txResult = await this.transactions.run(async (tx) => {
      const marked = await this.rgpd.markPendingDeletion(input.userId, until, tx);
      if (marked.isFailure) return marked;
      await emitEvent(
        this.outbox,
        EventTypes.USER_DELETION_REQUESTED,
        "user",
        input.userId,
        { userId: input.userId, pendingDeletionUntil: until },
        {},
        tx,
      );
      return Result.ok<void, RgpdError>(undefined);
    });
    if (txResult.isFailure) return Result.fail(txResult.getError());

    const cancelUrl = `${env.APP_URL}/settings/account`;
    const sent = await this.email.sendTemplate(
      "delete_requested",
      state.email,
      { name: state.name, cancelUrl, expiresAt: until.toISOString() },
      { idempotencyKey: `delete-requested/${input.userId}/${until.getTime()}` },
    );
    if (sent.isFailure)
      logger.warn(
        { userId: input.userId, code: sent.getError().code },
        "deletion marked but notification email failed",
      );

    return Result.ok({ pendingDeletionUntil: until.toISOString() });
  }

  async cancelAccountDeletion(
    input: CancelAccountDeletionInput,
  ): Promise<Result<CancelAccountDeletionOutput, RgpdError>> {
    const stateResult = await this.rgpd.getUserDeletionState(input.userId);
    if (stateResult.isFailure) return Result.fail(stateResult.getError());
    const stateOpt = stateResult.getValue();
    if (stateOpt.isNone())
      return Result.fail({ code: "ACCOUNT_DELETION_NOT_FOUND", message: "user not found" });

    const state = stateOpt.unwrap();
    if (state.deletedAt.isSome())
      return Result.fail({
        code: "ACCOUNT_DELETION_NOT_FOUND",
        message: "account has already been wiped",
      });

    if (state.pendingDeletionUntil.isNone())
      return Result.fail({
        code: "ACCOUNT_DELETION_NOT_FOUND",
        message: "no pending deletion to cancel",
      });
    const pendingUntil = state.pendingDeletionUntil.unwrap();

    const txResult = await this.transactions.run(async (tx) => {
      const cleared = await this.rgpd.clearPendingDeletion(input.userId, tx);
      if (cleared.isFailure) return cleared;
      await emitEvent(
        this.outbox,
        EventTypes.USER_DELETION_CANCELLED,
        "user",
        input.userId,
        { userId: input.userId },
        {},
        tx,
      );
      return Result.ok<void, RgpdError>(undefined);
    });
    if (txResult.isFailure) return Result.fail(txResult.getError());

    const sent = await this.email.sendTemplate(
      "delete_cancelled",
      state.email,
      { name: state.name },
      {
        idempotencyKey: `delete-cancelled/${input.userId}/${pendingUntil.getTime()}`,
      },
    );
    if (sent.isFailure)
      logger.warn(
        { userId: input.userId, code: sent.getError().code },
        "deletion cleared but notification email failed",
      );

    return Result.ok({ ok: true });
  }

  async executeAccountWipe(
    input: ExecuteAccountWipeInput,
  ): Promise<Result<ExecuteAccountWipeOutput, RgpdError>> {
    const stateResult = await this.rgpd.getUserDeletionState(input.userId);
    if (stateResult.isFailure) return Result.fail(stateResult.getError());
    const stateOpt = stateResult.getValue();
    if (stateOpt.isNone())
      return Result.fail({ code: "ACCOUNT_DELETION_NOT_FOUND", message: "user not found" });

    const state = stateOpt.unwrap();
    if (state.deletedAt.isSome()) return Result.ok({ deletedOrgIds: [], storageKeysDeleted: 0 });

    if (state.pendingDeletionUntil.isNone() || state.pendingDeletionUntil.unwrap() > new Date())
      return Result.fail({
        code: "ACCOUNT_DELETION_NOT_FOUND",
        message: "user is not in pending_deletion state or grace has not elapsed",
      });

    // Capture original email + name before the tx mutates them, so the final
    // confirmation email lands in the user's actual inbox.
    const originalEmail = state.email;
    const originalName = state.name;

    let wipeOutput: ExecuteWipeOutput;
    try {
      const inner = await this.transactions.run(async (trx) => {
        const wipe = await this.rgpd.executeWipe(input.userId, trx);
        if (wipe.isFailure) return wipe;
        await emitEvent(
          this.outbox,
          EventTypes.USER_DELETED,
          "user",
          input.userId,
          { userId: input.userId, deletedAt: new Date() },
          {},
          trx,
        );
        return wipe;
      });
      if (inner.isFailure) {
        logger.error(
          { userId: input.userId, code: inner.getError().code },
          "account wipe transaction reported failure",
        );
        return Result.fail({
          code: "ACCOUNT_WIPE_PROVIDER_FAILURE",
          message: "wipe transaction failed",
        });
      }
      wipeOutput = inner.getValue();
    } catch (e) {
      logger.error({ err: e, userId: input.userId }, "account wipe transaction failed");
      return Result.fail({
        code: "ACCOUNT_WIPE_PROVIDER_FAILURE",
        message: "wipe transaction failed",
      });
    }

    // Storage cleanup is post-tx: object storage isn't transactional, so we accept
    // the tradeoff. A crash here leaves orphaned blobs but the DB row is already
    // anonymized — re-running the sweep won't pick this user up again (deletedAt set),
    // so a one-shot janitor or manual cleanup is required for those leftovers.
    const list = await this.storage.listObjectKeys(`${input.userId}/`);
    let keysDeleted = 0;
    if (list.isSuccess) {
      const keys = list.getValue();
      keysDeleted = keys.length;
      const del = await this.storage.deleteObjects(keys);
      if (del.isFailure)
        logger.warn(
          { userId: input.userId, code: del.getError().code },
          "storage prefix delete failed after wipe — orphaned blobs need manual cleanup",
        );
    } else {
      logger.warn(
        { userId: input.userId, code: list.getError().code },
        "storage prefix listing failed after wipe — orphaned blobs need manual cleanup",
      );
    }

    const sent = await this.email.sendTemplate(
      "delete_completed",
      originalEmail,
      { name: originalName },
      { idempotencyKey: `delete-completed/${input.userId}` },
    );
    if (sent.isFailure)
      logger.warn(
        { userId: input.userId, code: sent.getError().code },
        "wipe completed but final notification email failed",
      );

    return Result.ok({
      deletedOrgIds: wipeOutput.deletedOrgIds ?? [],
      storageKeysDeleted: keysDeleted,
    });
  }

  async processPendingDeletions(
    input: ProcessPendingDeletionsInput,
  ): Promise<Result<ProcessPendingDeletionsOutput, never>> {
    const batchResult = await this.rgpd.findUsersReadyForWipe(input.batchSize ?? 50);
    if (batchResult.isFailure) {
      logger.error(
        { code: batchResult.getError().code },
        "rgpd sweep aborted — could not load batch",
      );
      return Result.ok({ processed: 0, succeeded: [], failed: [], dryRun: input.dryRun === true });
    }
    const batch = batchResult.getValue();
    const dryRun = input.dryRun === true;

    if (dryRun)
      return Result.ok({
        processed: batch.length,
        succeeded: batch.map((r) => r.userId),
        failed: [],
        dryRun: true,
      });

    const succeeded: string[] = [];
    const failed: Array<{ userId: string; errorCode: string }> = [];

    for (const row of batch) {
      try {
        const res = await this.executeAccountWipe({ userId: row.userId });
        if (res.isSuccess) {
          succeeded.push(row.userId);
        } else {
          failed.push({ userId: row.userId, errorCode: res.getError().code });
        }
      } catch (e) {
        const message = e instanceof Error ? e.message : "unknown";
        failed.push({ userId: row.userId, errorCode: "WIPE_UNCAUGHT" });
        logger.error({ err: e, userId: row.userId, message }, "wipe threw uncaught error");
      }
    }

    if (succeeded.length > 0)
      logger.info(
        { processed: batch.length, succeeded: succeeded.length, failed: failed.length },
        "rgpd sweep completed",
      );

    if (failed.length > 0) logger.warn({ failed }, "rgpd sweep had failures");

    return Result.ok({
      processed: batch.length,
      succeeded,
      failed,
      dryRun: false,
    });
  }

  async requestDataExport(
    input: RequestDataExportInput,
  ): Promise<Result<RequestDataExportOutput, RgpdError | StorageError>> {
    const stateResult = await this.rgpd.getUserDeletionState(input.userId);
    if (stateResult.isFailure) return Result.fail(stateResult.getError());
    const stateOpt = stateResult.getValue();
    if (stateOpt.isNone())
      return Result.fail({ code: "ACCOUNT_DELETION_NOT_FOUND", message: "user not found" });

    const state = stateOpt.unwrap();

    const exportRateLimitHours = env.RGPD_EXPORT_RATE_LIMIT_HOURS ?? 24;
    const minNextRequestAt = state.lastExportRequestedAt.isSome()
      ? state.lastExportRequestedAt.unwrap().getTime() + exportRateLimitHours * 60 * 60 * 1000
      : 0;
    if (Date.now() < minNextRequestAt) {
      return Result.fail({
        code: "ACCOUNT_EXPORT_RATE_LIMITED",
        message: `data export limited to once per ${exportRateLimitHours}h`,
      });
    }

    const payloadResult = await this.rgpd.collectUserDataForExport(input.userId);
    if (payloadResult.isFailure) return Result.fail(payloadResult.getError());
    const payload = payloadResult.getValue();
    const key = `${input.userId}/exports/${crypto.randomUUID()}.json`;

    const upload = await this.storage.uploadObject({
      key,
      body: JSON.stringify(payload, null, 2),
      contentType: "application/json",
    });
    if (upload.isFailure) return Result.fail(upload.getError());

    const presigned = await this.storage.presignDownload({
      key,
      expiresInSeconds: EXPORT_DOWNLOAD_TTL_SECONDS,
    });
    if (presigned.isFailure) return Result.fail(presigned.getError());

    const txResult = await this.transactions.run(async (tx) => {
      const touched = await this.rgpd.touchExportRequestedAt(input.userId, tx);
      if (touched.isFailure) return touched;
      await emitEvent(
        this.outbox,
        EventTypes.USER_EXPORT_REQUESTED,
        "user",
        input.userId,
        { userId: input.userId },
        {},
        tx,
      );
      await emitEvent(
        this.outbox,
        EventTypes.USER_EXPORT_COMPLETED,
        "user",
        input.userId,
        {
          userId: input.userId,
          storageKey: key,
          expiresAt: new Date(presigned.getValue().expiresAt),
        },
        {},
        tx,
      );
      return Result.ok<void, RgpdError>(undefined);
    });
    if (txResult.isFailure) return Result.fail(txResult.getError());

    const sent = await this.email.sendTemplate(
      "data_export_ready",
      state.email,
      {
        name: state.name,
        downloadUrl: presigned.getValue().url,
        expiresAt: presigned.getValue().expiresAt,
      },
      { idempotencyKey: `data-export/${key}` },
    );
    if (sent.isFailure)
      logger.warn(
        { userId: input.userId, code: sent.getError().code },
        "data export upload succeeded but email failed",
      );

    return Result.ok({ ok: true, expiresAt: presigned.getValue().expiresAt });
  }
}
