import { PERSONAL_ORG_SLUG_LIKE_PATTERN } from "@packages/access-control";
import { type IInstrumentation, type ILogger, Result } from "@packages/ddd-kit";
import {
  and,
  dbOperationFailure,
  eq,
  inArray,
  isNull,
  like,
  or,
  resolveExecutor,
  schema,
} from "@packages/drizzle";
import type {
  IAccountEraser,
  RemovedMembership,
} from "../../../application/ports/repositories/account-eraser.port";
import type { RgpdError } from "../../../application/ports/repositories/deletion-state.port";
import type { EndedSessionRow } from "../../../application/ports/services/ended-sessions.port";

const ANONYMIZED_DOMAIN = "anonymized.local";
const ANONYMIZED_NAME = "[deleted]";

const repositoryFailure = dbOperationFailure("RGPD_REPOSITORY_PROVIDER_FAILURE");

export class DrizzleAccountEraser implements IAccountEraser {
  constructor(
    private readonly logger: ILogger,
    private readonly instrumentation: IInstrumentation,
  ) {}

  anonymize(userId: string): Promise<Result<boolean, RgpdError>> {
    const exec = resolveExecutor();
    return this.guarded("anonymize", userId, async () => {
      const updated = await exec
        .update(schema.user)
        .set({
          email: `deleted-${crypto.randomUUID()}@${ANONYMIZED_DOMAIN}`,
          name: ANONYMIZED_NAME,
          image: null,
          emailVerified: false,
          twoFactorEnabled: false,
          pendingDeletionUntil: null,
          stripeCustomerId: null,
          deletedAt: new Date(),
        })
        .where(and(eq(schema.user.id, userId), isNull(schema.user.deletedAt)))
        .returning({ id: schema.user.id });

      return updated.length > 0;
    });
  }

  endSessionsAndCredentials(userId: string): Promise<Result<EndedSessionRow[], RgpdError>> {
    const exec = resolveExecutor();
    return this.guarded("endSessionsAndCredentials", userId, async () => {
      const ended = await exec
        .delete(schema.session)
        .where(eq(schema.session.userId, userId))
        .returning({
          sessionId: schema.session.id,
          userId: schema.session.userId,
          impersonatedBy: schema.session.impersonatedBy,
          createdAt: schema.session.createdAt,
          expiresAt: schema.session.expiresAt,
        });
      await exec.delete(schema.account).where(eq(schema.account.userId, userId));
      await exec.delete(schema.twoFactor).where(eq(schema.twoFactor.userId, userId));
      await exec.delete(schema.passkey).where(eq(schema.passkey.userId, userId));

      return ended;
    });
  }

  removeMemberships(userId: string): Promise<Result<RemovedMembership[], RgpdError>> {
    const exec = resolveExecutor();
    return this.guarded("removeMemberships", userId, async () => {
      const removed = await exec
        .delete(schema.member)
        .where(eq(schema.member.userId, userId))
        .returning({ memberId: schema.member.id, organizationId: schema.member.organizationId });
      await exec.delete(schema.invitation).where(eq(schema.invitation.inviterId, userId));

      return removed;
    });
  }

  deleteAbandonedOrganizations(organizationIds: string[]): Promise<Result<string[], RgpdError>> {
    const exec = resolveExecutor();
    return this.guarded("deleteAbandonedOrganizations", organizationIds, async () => {
      if (organizationIds.length === 0) return [];

      const deleted = await exec
        .delete(schema.organization)
        .where(
          and(
            inArray(schema.organization.id, organizationIds),
            or(
              like(schema.organization.slug, PERSONAL_ORG_SLUG_LIKE_PATTERN),
              eq(
                exec.$count(
                  schema.member,
                  eq(schema.member.organizationId, schema.organization.id),
                ),
                0,
              ),
            ),
          ),
        )
        .returning({ id: schema.organization.id });

      return deleted.map((o) => o.id);
    });
  }

  private guarded<T>(
    method: string,
    subject: string | string[],
    run: () => Promise<T>,
  ): Promise<Result<T, RgpdError>> {
    return this.instrumentation.startSpan(
      { name: `DrizzleAccountEraser > ${method}` },
      async () => {
        try {
          return Result.ok(await run());
        } catch (err) {
          this.instrumentation.capture(err);
          this.logger.error({ err, subject }, `AccountEraser.${method} failed`);
          return Result.fail(repositoryFailure(method));
        }
      },
    );
  }
}
