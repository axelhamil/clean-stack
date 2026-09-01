import { type AppError, type IUnitOfWork, Result } from "@packages/ddd-kit";
import { eq, multiTenantSchema } from "@packages/drizzle";
import { EventTypes } from "@packages/events";
import { auth } from "../../auth";
import { emitEvent } from "../event-emitter";
import type { IInstrumentation } from "../ports/instrumentation.port";
import type { IOutboxRepository } from "../ports/outbox.port";
import type { ITransaction } from "../transaction";

export type AdminActionError = AppError<"ADMIN_ACTION_PROVIDER_FAILURE">;

type ActionResult = Promise<Result<void, AdminActionError>>;

/**
 * Lives in `shared/services/` rather than a module because it has two
 * consumers on opposite sides of a permission boundary: the platform-admin
 * routes (`modules/admin/admin-orgs.routes.ts`) and the org-owner settings
 * routes (`modules/organization/routes.ts`) both call `setSsoEnforcement`.
 * It also imports the BetterAuth singleton (`auth.ts`) directly, which
 * itself depends on the DI container — registering this class inside a
 * module's `defineModule()` would create an import cycle
 * (`module.ts` → this file → `auth.ts` → `container.ts` → `module.ts`).
 * Route files instantiate it ad hoc from already-built `di` bindings
 * instead of resolving it through the container.
 */
export class AdminActionService {
  constructor(
    private readonly outbox: IOutboxRepository,
    private readonly uow: IUnitOfWork<ITransaction>,
    private readonly instrumentation: IInstrumentation,
  ) {}

  async ban(input: {
    actorUserId: string;
    userId: string;
    reason: string;
    expiresIn?: number;
    headers: Headers;
  }): ActionResult {
    return this.run("ban", async () => {
      await auth.api.banUser({
        body: { userId: input.userId, banReason: input.reason, banExpiresIn: input.expiresIn },
        headers: input.headers,
      });
      const expiresAt = input.expiresIn
        ? new Date(Date.now() + input.expiresIn * 1000).toISOString()
        : null;
      await emitEvent(this.outbox, EventTypes.ADMIN_USER_BANNED, "user", input.userId, {
        actorUserId: input.actorUserId,
        userId: input.userId,
        reason: input.reason,
        expiresAt,
      });
    });
  }

  async unban(input: { actorUserId: string; userId: string; headers: Headers }): ActionResult {
    return this.run("unban", async () => {
      await auth.api.unbanUser({ body: { userId: input.userId }, headers: input.headers });
      await emitEvent(this.outbox, EventTypes.ADMIN_USER_UNBANNED, "user", input.userId, {
        actorUserId: input.actorUserId,
        userId: input.userId,
      });
    });
  }

  async setRole(input: {
    actorUserId: string;
    userId: string;
    role: "admin" | "user";
    previousRole: string | null;
    headers: Headers;
  }): ActionResult {
    return this.run("setRole", async () => {
      await auth.api.setRole({
        body: { userId: input.userId, role: input.role },
        headers: input.headers,
      });
      await emitEvent(this.outbox, EventTypes.ADMIN_USER_ROLE_CHANGED, "user", input.userId, {
        actorUserId: input.actorUserId,
        userId: input.userId,
        from: input.previousRole,
        to: input.role,
      });
    });
  }

  async revokeSessions(input: {
    actorUserId: string;
    userId: string;
    count: number;
    headers: Headers;
  }): ActionResult {
    return this.run("revokeSessions", async () => {
      await auth.api.revokeUserSessions({ body: { userId: input.userId }, headers: input.headers });
      await emitEvent(this.outbox, EventTypes.ADMIN_USER_SESSIONS_REVOKED, "user", input.userId, {
        actorUserId: input.actorUserId,
        userId: input.userId,
        count: input.count,
      });
    });
  }

  async resetPassword(input: {
    actorUserId: string;
    userId: string;
    email: string;
    headers: Headers;
  }): ActionResult {
    return this.run("resetPassword", async () => {
      await auth.api.revokeUserSessions({ body: { userId: input.userId }, headers: input.headers });
      await auth.api.requestPasswordReset({ body: { email: input.email } });
      await emitEvent(this.outbox, EventTypes.ADMIN_USER_PASSWORD_RESET, "user", input.userId, {
        actorUserId: input.actorUserId,
        userId: input.userId,
      });
    });
  }

  async setSsoEnforcement(input: {
    organizationId: string;
    enforced: boolean;
    actorUserId: string;
    viaPlatformAdmin: boolean;
  }): ActionResult {
    return this.run("setSsoEnforcement", async () => {
      await this.uow.run(async (tx) => {
        await tx
          .update(multiTenantSchema.organization)
          .set({ ssoEnforced: input.enforced })
          .where(eq(multiTenantSchema.organization.id, input.organizationId));

        await emitEvent(
          this.outbox,
          EventTypes.SSO_ENFORCEMENT_CHANGED,
          "organization",
          input.organizationId,
          {
            actorUserId: input.actorUserId,
            organizationId: input.organizationId,
            enforced: input.enforced,
            viaPlatformAdmin: input.viaPlatformAdmin,
          },
          { organizationId: input.organizationId },
          tx,
        );
      });
    });
  }

  private async run(method: string, body: () => Promise<void>): ActionResult {
    return this.instrumentation.startSpan({ name: `AdminActionService > ${method}` }, async () => {
      try {
        await body();
        return Result.ok();
      } catch (err) {
        this.instrumentation.capture(err);
        return Result.fail({
          code: "ADMIN_ACTION_PROVIDER_FAILURE",
          message: `Failed to ${method}`,
        });
      }
    });
  }
}
