import { type AppError, type IUnitOfWork, Option, Result } from "@packages/ddd-kit";
import { EventTypes } from "@packages/events";
import { emitEvent } from "../../../../shared/event-emitter";
import type { IOutboxRepository } from "../../../../shared/ports/outbox.port";
import type {
  AdminStoreError,
  EndedSession,
  IAdminUserStore,
} from "../ports/admin-user-store.port";

export type AdminModerationError =
  | AdminStoreError
  | AppError<"ADMIN_USER_NOT_FOUND">
  | AppError<"ADMIN_USER_SELF_BAN_FORBIDDEN">;

interface ModerationSubject {
  actorUserId: string;
  userId: string;
}

interface ImpersonationStart extends ModerationSubject {
  reason: string;
  ticketRef?: string;
  ip: string | null;
  expiresAt: string;
}

interface ImpersonationStop extends ModerationSubject {
  durationMs: number;
}

const userNotFound: AppError<"ADMIN_USER_NOT_FOUND"> = {
  code: "ADMIN_USER_NOT_FOUND",
  message: "User not found.",
};

export class AdminModerationService {
  constructor(
    private readonly store: IAdminUserStore,
    private readonly outbox: IOutboxRepository,
    private readonly uow: IUnitOfWork,
  ) {}

  async ban(
    input: ModerationSubject & { reason: string; expiresIn?: number },
  ): Promise<Result<void, AdminModerationError>> {
    if (input.actorUserId === input.userId) {
      return Result.fail({
        code: "ADMIN_USER_SELF_BAN_FORBIDDEN",
        message: "You cannot ban your own account.",
      });
    }

    const expiresAt = input.expiresIn
      ? Option.some(new Date(Date.now() + input.expiresIn * 1000))
      : Option.none<Date>();

    return this.uow.run(async (): Promise<Result<void, AdminModerationError>> => {
      const banned = await this.store.ban({
        userId: input.userId,
        reason: input.reason,
        expiresAt,
      });
      if (banned.isFailure) return Result.fail(banned.getError());
      if (banned.getValue().isNone()) return Result.fail(userNotFound);

      await this.announceEnded(banned.getValue().unwrap());
      await emitEvent(this.outbox, EventTypes.ADMIN_USER_BANNED, "user", input.userId, {
        actorUserId: input.actorUserId,
        userId: input.userId,
        reason: input.reason,
        expiresAt: expiresAt.map((date) => date.toISOString()).toNull(),
      });

      return Result.ok();
    });
  }

  async unban(input: ModerationSubject): Promise<Result<void, AdminModerationError>> {
    return this.uow.run(async (): Promise<Result<void, AdminModerationError>> => {
      const unbanned = await this.store.unban(input.userId);
      if (unbanned.isFailure) return Result.fail(unbanned.getError());
      if (!unbanned.getValue()) return Result.fail(userNotFound);

      await emitEvent(this.outbox, EventTypes.ADMIN_USER_UNBANNED, "user", input.userId, {
        actorUserId: input.actorUserId,
        userId: input.userId,
      });

      return Result.ok();
    });
  }

  async revokeSessions(input: ModerationSubject): Promise<Result<void, AdminModerationError>> {
    return this.uow.run(async (): Promise<Result<void, AdminModerationError>> => {
      const ended = await this.store.deleteSessions(input.userId);
      if (ended.isFailure) return Result.fail(ended.getError());

      await this.announceEnded(ended.getValue());
      await emitEvent(this.outbox, EventTypes.ADMIN_USER_SESSIONS_REVOKED, "user", input.userId, {
        actorUserId: input.actorUserId,
        userId: input.userId,
        count: ended.getValue().length,
      });

      return Result.ok();
    });
  }

  async resetPassword(
    input: ModerationSubject,
    requestReset: () => Promise<unknown>,
  ): Promise<Result<void, AdminModerationError>> {
    return this.uow.run(async (): Promise<Result<void, AdminModerationError>> => {
      const ended = await this.store.deleteSessions(input.userId);
      if (ended.isFailure) return Result.fail(ended.getError());

      await this.announceEnded(ended.getValue());
      await emitEvent(this.outbox, EventTypes.ADMIN_USER_PASSWORD_RESET, "user", input.userId, {
        actorUserId: input.actorUserId,
        userId: input.userId,
      });
      await requestReset();

      return Result.ok();
    });
  }

  startImpersonation<T, E>(
    input: ImpersonationStart,
    start: () => Promise<Result<T, E>>,
  ): Promise<Result<T, E>> {
    return this.uow.run(async () => {
      await emitEvent(this.outbox, EventTypes.ADMIN_IMPERSONATION_STARTED, "user", input.userId, {
        actorUserId: input.actorUserId,
        userId: input.userId,
        reason: input.reason,
        ticketRef: input.ticketRef,
        ip: input.ip,
        expiresAt: input.expiresAt,
      });

      return start();
    });
  }

  stopImpersonation<T, E>(
    input: ImpersonationStop,
    stop: () => Promise<Result<T, E>>,
  ): Promise<Result<T, E>> {
    return this.uow.run(async () => {
      await emitEvent(this.outbox, EventTypes.ADMIN_IMPERSONATION_STOPPED, "user", input.userId, {
        actorUserId: input.actorUserId,
        userId: input.userId,
        durationMs: input.durationMs,
      });

      return stop();
    });
  }

  private async announceEnded(sessions: EndedSession[]): Promise<void> {
    for (const session of sessions) {
      await emitEvent(this.outbox, EventTypes.USER_SIGNED_OUT, "session", session.id, {
        userId: session.userId,
        sessionId: session.id,
      });
    }
  }
}
