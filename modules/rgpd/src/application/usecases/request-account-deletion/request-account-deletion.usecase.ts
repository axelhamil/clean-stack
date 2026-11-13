import { type ILogger, type IUnitOfWork, type IUseCase, Result } from "@packages/ddd-kit";
import type { IEmailService } from "@packages/email/email.port";
import { emitBuiltEvent } from "@packages/outbox/event-emitter";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import { gracePeriodEnd } from "../../../domain/deletion/services/deletion-eligibility.service";
import type { RgpdSettings } from "../../config/rgpd-settings";
import { userDeletionRequestedEvent } from "../../events/user-deletion-requested.event";
import type {
  IDeletionStateRepository,
  RgpdError,
  UserDeletionState,
} from "../../ports/repositories/deletion-state.port";
import type { IPasswordVerifier } from "../../ports/services/password-verifier.port";
import type { IStaffAccessRules } from "../../ports/services/staff-access-rules.port";
import type { IStaffStore } from "../../ports/services/staff-store.port";
import type { ITotpVerifier } from "../../ports/services/totp-verifier.port";
import type { IPreflightAccountDeletionQuery } from "../../queries/preflight-account-deletion.query";
import type {
  RequestAccountDeletionInput,
  RequestAccountDeletionOutput,
} from "./request-account-deletion.dto";

export interface RequestAccountDeletionCollaborators {
  states: IDeletionStateRepository;
  preflight: IPreflightAccountDeletionQuery;
  totp: ITotpVerifier;
  passwords: IPasswordVerifier;
  staff: IStaffStore;
  staffAccess: IStaffAccessRules;
  email: IEmailService;
  transactions: IUnitOfWork;
  outbox: IOutboxRepository;
  settings: Pick<RgpdSettings, "appUrl" | "gracePeriodDays">;
  logger: ILogger;
}

export class RequestAccountDeletionUseCase
  implements IUseCase<RequestAccountDeletionInput, RequestAccountDeletionOutput, RgpdError>
{
  constructor(private readonly deps: RequestAccountDeletionCollaborators) {}

  async execute(
    input: RequestAccountDeletionInput,
  ): Promise<Result<RequestAccountDeletionOutput, RgpdError>> {
    const found = await this.deps.states.findByUser(input.userId);
    if (found.isFailure) return Result.fail(found.getError());
    if (found.getValue().isNone())
      return Result.fail({ code: "ACCOUNT_DELETION_NOT_FOUND", message: "user not found" });

    const state = found.getValue().unwrap();
    const alreadyPending = state.deletion.pendingUntil();
    if (alreadyPending.isSome())
      return Result.ok({ pendingDeletionUntil: alreadyPending.unwrap().toISOString() });

    const preflight = await this.deps.preflight.execute({ userId: input.userId });
    if (preflight.isFailure) return Result.fail(preflight.getError());
    const blocking = preflight.getValue().blockingOrgs;
    if (blocking.length > 0)
      return Result.fail({
        code: "ACCOUNT_DELETION_BLOCKED",
        message: "transfer ownership or delete the listed organizations before account deletion",
        metadata: { offendingOrgs: blocking },
      });

    const confirmed = await this.confirmIdentity(input, state);
    if (confirmed.isFailure) return Result.fail(confirmed.getError());

    const until = gracePeriodEnd(new Date(), this.deps.settings.gracePeriodDays);
    const marked = await this.deps.transactions.run(async () => {
      const refused = await this.lastManagerRefusal(input.userId);
      if (refused.isFailure) return refused;

      const pending = await this.deps.states.markPending(input.userId, until);
      if (pending.isFailure) return pending;

      await emitBuiltEvent(
        this.deps.outbox,
        userDeletionRequestedEvent({ userId: input.userId, pendingDeletionUntil: until }),
      );

      return Result.ok<RgpdError>();
    });
    if (marked.isFailure) return Result.fail(marked.getError());

    const sent = await this.deps.email.sendTemplate(
      "delete_requested",
      state.email,
      {
        name: state.name,
        cancelUrl: `${this.deps.settings.appUrl}/settings/account`,
        expiresAt: until.toISOString(),
      },
      {
        idempotencyKey: `delete-requested/${input.userId}/${until.getTime()}`,
        locale: state.locale.toUndefined(),
      },
    );
    if (sent.isFailure)
      this.deps.logger.warn(
        { userId: input.userId, code: sent.getError().code },
        "deletion marked but notification email failed",
      );

    return Result.ok({ pendingDeletionUntil: until.toISOString() });
  }

  private async confirmIdentity(
    input: RequestAccountDeletionInput,
    state: UserDeletionState,
  ): Promise<Result<void, RgpdError>> {
    if (state.twoFactorEnabled) {
      if (!input.totpCode)
        return Result.fail({
          code: "TWO_FACTOR_REQUIRED",
          message: "two-factor TOTP code required",
        });

      const totp = await this.deps.totp.consume(input.userId, input.totpCode);
      if (totp.isFailure) return Result.fail(totp.getError());
      if (totp.getValue() !== "accepted")
        return Result.fail({ code: "TWO_FACTOR_INVALID", message: "invalid TOTP code" });

      return Result.ok();
    }

    if (!input.password)
      return Result.fail({
        code: "ACCOUNT_PASSWORD_REQUIRED",
        message: "password required to confirm deletion",
      });

    const matches = await this.deps.passwords.matches(input.userId, input.password);
    if (matches.isFailure) return Result.fail(matches.getError());
    if (!matches.getValue())
      return Result.fail({ code: "ACCOUNT_PASSWORD_INVALID", message: "invalid password" });

    return Result.ok();
  }

  private async lastManagerRefusal(userId: string): Promise<Result<void, RgpdError>> {
    const { staff, staffAccess } = this.deps;
    if (staffAccess.isListed(userId)) return Result.ok();

    const found = await staff.findActive(userId);
    if (found.isFailure) return Result.fail(found.getError());

    const isManager = found
      .getValue()
      .filter((row) => row.role === "manager" && staffAccess.grantsStaffAccess(row))
      .isSome();
    if (!isManager) return Result.ok();

    const managers = await staff.lockActiveManagers();
    if (managers.isFailure) return Result.fail(managers.getError());
    if (!staffAccess.isLastManager(userId, managers.getValue())) return Result.ok();

    return Result.fail({
      code: "ACCOUNT_DELETION_LAST_MANAGER_FORBIDDEN",
      message: "appoint another staff manager before deleting this account",
    });
  }
}
