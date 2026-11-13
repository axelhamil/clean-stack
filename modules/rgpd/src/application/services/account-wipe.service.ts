import { type IInstrumentation, type ILogger, type IUnitOfWork, Result } from "@packages/ddd-kit";
import type { IEmailService } from "@packages/email/email.port";
import { emitBuiltEvent } from "@packages/outbox/event-emitter";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import { wipeEligibility } from "../../domain/deletion/services/deletion-eligibility.service";
import { adminStaffRevokedEvent } from "../events/admin-staff-revoked.event";
import { apiTokenRevokedEvent } from "../events/api-token-revoked.event";
import { orgDeletedEvent } from "../events/org-deleted.event";
import { orgMemberRemovedEvent } from "../events/org-member-removed.event";
import { userDeletedEvent } from "../events/user-deleted.event";
import type { IAccountEraser } from "../ports/repositories/account-eraser.port";
import type {
  IDeletionStateRepository,
  RgpdError,
  UserDeletionState,
} from "../ports/repositories/deletion-state.port";
import type { IApiTokenRevoker } from "../ports/services/api-token-revoker.port";
import type { IEndedSessionsReader } from "../ports/services/ended-sessions.port";
import type { IExportStorage } from "../ports/services/export-storage.port";
import type { IStaffAccessRules } from "../ports/services/staff-access-rules.port";
import type { IStaffDataEraser } from "../ports/services/staff-data-eraser.port";
import type { IStaffStore } from "../ports/services/staff-store.port";

export interface AccountWipeOutcome {
  deletedOrgIds: string[];
  storageKeysDeleted: number;
}

export interface AccountWipeCollaborators {
  states: IDeletionStateRepository;
  eraser: IAccountEraser;
  staffData: IStaffDataEraser;
  apiTokens: IApiTokenRevoker;
  endedSessions: IEndedSessionsReader;
  staff: IStaffStore;
  staffAccess: IStaffAccessRules;
  storage: IExportStorage;
  email: IEmailService;
  transactions: IUnitOfWork;
  outbox: IOutboxRepository;
  instrumentation: IInstrumentation;
  logger: ILogger;
}

const WIPE_FAILED: RgpdError = {
  code: "ACCOUNT_WIPE_PROVIDER_FAILURE",
  message: "wipe transaction failed",
};

export class AccountWipeService {
  constructor(private readonly deps: AccountWipeCollaborators) {}

  async wipe(userId: string): Promise<Result<AccountWipeOutcome, RgpdError>> {
    const found = await this.deps.states.findByUser(userId);
    if (found.isFailure) return Result.fail(found.getError());
    if (found.getValue().isNone())
      return Result.fail({ code: "ACCOUNT_DELETION_NOT_FOUND", message: "user not found" });

    const state = found.getValue().unwrap();
    const eligibility = wipeEligibility(state.deletion, new Date());
    if (eligibility === "wiped") return Result.ok({ deletedOrgIds: [], storageKeysDeleted: 0 });
    if (eligibility === "not-due")
      return Result.fail({
        code: "ACCOUNT_DELETION_NOT_FOUND",
        message: "user is not in pending_deletion state or grace has not elapsed",
      });

    let erased: Result<string[], RgpdError>;
    try {
      erased = await this.deps.transactions.run(() => this.eraseInOneUnit(userId, state));
    } catch (e) {
      this.deps.instrumentation.capture(e);
      this.deps.logger.error({ err: e, userId }, "account wipe transaction failed");
      return Result.fail(WIPE_FAILED);
    }

    if (erased.isFailure) {
      const failure = erased.getError();
      if (failure.code === "ACCOUNT_WIPE_NOTIFY_PROVIDER_FAILURE") return Result.fail(failure);

      this.deps.logger.error(
        { userId, code: failure.code, cause: failure.message },
        "account wipe transaction reported failure",
      );
      return Result.fail(WIPE_FAILED);
    }

    const storageKeysDeleted = await this.purgeUserObjects(userId);

    return Result.ok({ deletedOrgIds: erased.getValue(), storageKeysDeleted });
  }

  private async eraseInOneUnit(
    userId: string,
    state: UserDeletionState,
  ): Promise<Result<string[], RgpdError>> {
    const { eraser, outbox } = this.deps;

    const anonymized = await eraser.anonymize(userId);
    if (anonymized.isFailure) return Result.fail(anonymized.getError());
    if (!anonymized.getValue()) return Result.ok([]);

    const staffErased = await this.deps.staffData.eraseDataOf(userId);
    if (staffErased.isFailure) return this.foreignFailure(userId, staffErased.getError());

    const endedSessions = await eraser.endSessionsAndCredentials(userId);
    if (endedSessions.isFailure) return Result.fail(endedSessions.getError());

    const memberships = await eraser.removeMemberships(userId);
    if (memberships.isFailure) return Result.fail(memberships.getError());

    const revokedTokens = await this.deps.apiTokens.execute({ userId });
    if (revokedTokens.isFailure) return this.foreignFailure(userId, revokedTokens.getError());

    const deletedOrgs = await eraser.deleteAbandonedOrganizations(
      memberships.getValue().map((m) => m.organizationId),
    );
    if (deletedOrgs.isFailure) return Result.fail(deletedOrgs.getError());
    const deletedOrgIds = deletedOrgs.getValue();

    await this.deps.staffAccess.announceImpersonationsEnded(
      this.deps.endedSessions.impersonationsOf(endedSessions.getValue()),
      "revoked",
      new Date(),
    );

    const staffRevoked = await this.revokeStaffAccess(userId);
    if (staffRevoked.isFailure) return Result.fail(staffRevoked.getError());

    await emitBuiltEvent(outbox, userDeletedEvent({ userId, deletedAt: new Date() }));
    for (const organizationId of deletedOrgIds) {
      await emitBuiltEvent(outbox, orgDeletedEvent({ organizationId, erasedUserId: userId }), {
        organizationId,
      });
    }
    for (const { memberId, organizationId } of memberships.getValue()) {
      if (deletedOrgIds.includes(organizationId)) continue;

      await emitBuiltEvent(
        outbox,
        orgMemberRemovedEvent({ memberId, organizationId, erasedUserId: userId }),
        { organizationId },
      );
    }
    for (const { tokenId, organizationId } of revokedTokens.getValue()) {
      await emitBuiltEvent(
        outbox,
        apiTokenRevokedEvent({ tokenId, organizationId, erasedUserId: userId }),
        { organizationId: organizationId.toNull() },
      );
    }

    const notified = await this.deps.email.sendTemplate(
      "delete_completed",
      state.email,
      { name: state.name },
      { locale: state.locale.toUndefined(), idempotencyKey: `delete-completed/${userId}` },
    );
    if (notified.isFailure) {
      this.deps.logger.error(
        { userId, code: notified.getError().code },
        "account wipe rolled back: deletion confirmation could not be enqueued",
      );
      return Result.fail({
        code: "ACCOUNT_WIPE_NOTIFY_PROVIDER_FAILURE",
        message: "deletion confirmation enqueue failed, wipe rolled back",
      });
    }

    return Result.ok(deletedOrgIds);
  }

  private foreignFailure(userId: string, err: unknown): Result<string[], RgpdError> {
    this.deps.logger.error({ err, userId }, "account wipe failed in a foreign erasure step");

    return Result.fail({
      code: "RGPD_REPOSITORY_PROVIDER_FAILURE",
      message: "database operation failed: executeWipe",
    });
  }

  private async revokeStaffAccess(userId: string): Promise<Result<void, RgpdError>> {
    const found = await this.deps.staff.findActive(userId);
    if (found.isFailure) return Result.fail(found.getError());
    if (found.getValue().isNone()) return Result.ok();

    const revoked = await this.deps.staff.revoke(userId);
    if (revoked.isFailure) return Result.fail(revoked.getError());

    await this.deps.staffAccess.announceImpersonationsEnded(
      revoked.getValue(),
      "revoked",
      new Date(),
    );

    await emitBuiltEvent(
      this.deps.outbox,
      adminStaffRevokedEvent({ userId, role: found.getValue().unwrap().role }),
    );

    return Result.ok();
  }

  private async purgeUserObjects(userId: string): Promise<number> {
    const list = await this.deps.storage.listObjectKeys(`${userId}/`);
    if (list.isFailure) {
      this.deps.logger.warn(
        { userId, code: list.getError().code },
        "storage prefix listing failed after wipe: orphaned blobs need manual cleanup",
      );
      return 0;
    }

    const keys = list.getValue();
    const deleted = await this.deps.storage.deleteObjects(keys);
    if (deleted.isFailure) {
      this.deps.logger.warn(
        { userId, code: deleted.getError().code },
        "storage prefix delete failed after wipe: orphaned blobs need manual cleanup",
      );
    }

    return keys.length;
  }
}
