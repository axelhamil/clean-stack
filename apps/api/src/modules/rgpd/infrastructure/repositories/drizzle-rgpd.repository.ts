import { createOTP } from "@better-auth/utils/otp";
import { PERSONAL_ORG_SLUG_LIKE_PATTERN } from "@packages/access-control";
import { Option, Result } from "@packages/ddd-kit";
import { and, db, eq, gt, inArray, isNull, like, lte, not, or, schema } from "@packages/drizzle";
import { symmetricDecrypt, verifyPassword as verifyHash } from "better-auth/crypto";
import { env } from "../../../../shared/env";
import type { Logger } from "../../../../shared/logger";
import type { IInstrumentation } from "../../../../shared/ports/instrumentation.port";
import type { ITransaction } from "../../../../shared/transaction";
import type {
  ExecuteWipeOutput,
  IRgpdRepository,
  PendingDeletionRow,
  RgpdError,
  SoleOwnedOrgWithMembers,
  UserDeletionState,
  UserExportPayload,
} from "../../application/ports/rgpd.port";

const dbAttrs = { "db.system.name": "postgresql" } as const;
const ANONYMIZED_DOMAIN = "anonymized.local";
const ANONYMIZED_NAME = "[deleted]";

function repositoryFailure(err: unknown, op: string): RgpdError {
  return {
    code: "RGPD_REPOSITORY_PROVIDER_FAILURE",
    message: `database operation failed: ${op}`,
    metadata: { cause: err instanceof Error ? err.message : String(err) },
  };
}

export class DrizzleRgpdRepository implements IRgpdRepository {
  constructor(
    private readonly logger: Logger,
    private readonly instrumentation: IInstrumentation,
  ) {}

  async findSoleOwnedNonPersonalOrgsWithMembers(
    userId: string,
    tx?: ITransaction,
  ): Promise<Result<SoleOwnedOrgWithMembers[], RgpdError>> {
    const invoker = tx ?? db;
    return this.instrumentation.startSpan(
      { name: "DrizzleRgpdRepository > findSoleOwnedNonPersonalOrgsWithMembers" },
      async () => {
        try {
          const query = invoker
            .select({
              orgId: schema.organization.id,
              orgName: schema.organization.name,
              memberCount: invoker.$count(
                schema.member,
                eq(schema.member.organizationId, schema.organization.id),
              ),
            })
            .from(schema.member)
            .innerJoin(
              schema.organization,
              eq(schema.member.organizationId, schema.organization.id),
            )
            .where(
              and(
                eq(schema.member.userId, userId),
                eq(schema.member.role, "owner"),
                not(like(schema.organization.slug, PERSONAL_ORG_SLUG_LIKE_PATTERN)),
                eq(
                  invoker.$count(
                    schema.member,
                    and(
                      eq(schema.member.organizationId, schema.organization.id),
                      eq(schema.member.role, "owner"),
                    ),
                  ),
                  1,
                ),
                gt(
                  invoker.$count(
                    schema.member,
                    eq(schema.member.organizationId, schema.organization.id),
                  ),
                  1,
                ),
              ),
            );
          const rows = await this.instrumentation.startSpan(
            { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
            () => query.execute(),
          );

          return Result.ok(
            rows.map((r) => ({
              orgId: r.orgId,
              orgName: r.orgName,
              otherMembersCount: r.memberCount - 1,
            })),
          );
        } catch (err) {
          this.instrumentation.capture(err);
          this.logger.error(
            { err, userId },
            "RgpdRepository.findSoleOwnedNonPersonalOrgsWithMembers failed",
          );
          return Result.fail(repositoryFailure(err, "findSoleOwnedNonPersonalOrgsWithMembers"));
        }
      },
    );
  }

  async collectUserDataForExport(
    userId: string,
    tx?: ITransaction,
  ): Promise<Result<UserExportPayload, RgpdError>> {
    const invoker = tx ?? db;
    return this.instrumentation.startSpan(
      { name: "DrizzleRgpdRepository > collectUserDataForExport" },
      async () => {
        try {
          const userQuery = invoker
            .select()
            .from(schema.user)
            .where(eq(schema.user.id, userId))
            .limit(1);
          const [u] = await this.instrumentation.startSpan(
            { name: userQuery.toSQL().sql, op: "db.query", attributes: dbAttrs },
            () => userQuery.execute(),
          );
          if (!u)
            return Result.fail({ code: "ACCOUNT_DELETION_NOT_FOUND", message: "user not found" });

          const sessionsQuery = invoker
            .select({
              id: schema.session.id,
              createdAt: schema.session.createdAt,
              expiresAt: schema.session.expiresAt,
              ipAddress: schema.session.ipAddress,
              userAgent: schema.session.userAgent,
            })
            .from(schema.session)
            .where(eq(schema.session.userId, userId));
          const sessions = await this.instrumentation.startSpan(
            { name: sessionsQuery.toSQL().sql, op: "db.query", attributes: dbAttrs },
            () => sessionsQuery.execute(),
          );

          const membershipsQuery = invoker
            .select({
              organizationId: schema.organization.id,
              organizationName: schema.organization.name,
              organizationSlug: schema.organization.slug,
              role: schema.member.role,
              joinedAt: schema.member.createdAt,
            })
            .from(schema.member)
            .innerJoin(
              schema.organization,
              eq(schema.member.organizationId, schema.organization.id),
            )
            .where(eq(schema.member.userId, userId));
          const memberships = await this.instrumentation.startSpan(
            { name: membershipsQuery.toSQL().sql, op: "db.query", attributes: dbAttrs },
            () => membershipsQuery.execute(),
          );

          const invitationsQuery = invoker
            .select({
              id: schema.invitation.id,
              organizationId: schema.invitation.organizationId,
              email: schema.invitation.email,
              role: schema.invitation.role,
              status: schema.invitation.status,
              createdAt: schema.invitation.createdAt,
            })
            .from(schema.invitation)
            .where(eq(schema.invitation.inviterId, userId));
          const invitationsSent = await this.instrumentation.startSpan(
            { name: invitationsQuery.toSQL().sql, op: "db.query", attributes: dbAttrs },
            () => invitationsQuery.execute(),
          );

          return Result.ok({
            exportedAt: new Date().toISOString(),
            user: {
              id: u.id,
              name: u.name,
              email: u.email,
              emailVerified: u.emailVerified,
              image: u.image,
              createdAt: u.createdAt.toISOString(),
              updatedAt: u.updatedAt.toISOString(),
              twoFactorEnabled: u.twoFactorEnabled,
            },
            sessions: sessions.map((s) => ({
              id: s.id,
              createdAt: s.createdAt.toISOString(),
              expiresAt: s.expiresAt.toISOString(),
              ipAddress: s.ipAddress,
              userAgent: s.userAgent,
            })),
            memberships: memberships.map((m) => ({
              organizationId: m.organizationId,
              organizationName: m.organizationName,
              organizationSlug: m.organizationSlug,
              role: m.role,
              joinedAt: m.joinedAt.toISOString(),
            })),
            invitationsSent: invitationsSent.map((i) => ({
              id: i.id,
              organizationId: i.organizationId,
              email: i.email,
              role: i.role,
              status: i.status,
              createdAt: i.createdAt.toISOString(),
            })),
          });
        } catch (err) {
          this.instrumentation.capture(err);
          this.logger.error({ err, userId }, "RgpdRepository.collectUserDataForExport failed");
          return Result.fail(repositoryFailure(err, "collectUserDataForExport"));
        }
      },
    );
  }

  async markPendingDeletion(
    userId: string,
    until: Date,
    tx?: ITransaction,
  ): Promise<Result<void, RgpdError>> {
    const invoker = tx ?? db;
    return this.instrumentation.startSpan(
      { name: "DrizzleRgpdRepository > markPendingDeletion" },
      async () => {
        try {
          const query = invoker
            .update(schema.user)
            .set({ pendingDeletionUntil: until })
            .where(eq(schema.user.id, userId));
          await this.instrumentation.startSpan(
            { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
            () => query.execute(),
          );
          return Result.ok();
        } catch (err) {
          this.instrumentation.capture(err);
          this.logger.error({ err, userId }, "RgpdRepository.markPendingDeletion failed");
          return Result.fail(repositoryFailure(err, "markPendingDeletion"));
        }
      },
    );
  }

  async clearPendingDeletion(userId: string, tx?: ITransaction): Promise<Result<void, RgpdError>> {
    const invoker = tx ?? db;
    return this.instrumentation.startSpan(
      { name: "DrizzleRgpdRepository > clearPendingDeletion" },
      async () => {
        try {
          const query = invoker
            .update(schema.user)
            .set({ pendingDeletionUntil: null })
            .where(eq(schema.user.id, userId));
          await this.instrumentation.startSpan(
            { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
            () => query.execute(),
          );
          return Result.ok();
        } catch (err) {
          this.instrumentation.capture(err);
          this.logger.error({ err, userId }, "RgpdRepository.clearPendingDeletion failed");
          return Result.fail(repositoryFailure(err, "clearPendingDeletion"));
        }
      },
    );
  }

  async findUsersReadyForWipe(
    limit: number,
    tx?: ITransaction,
  ): Promise<Result<PendingDeletionRow[], RgpdError>> {
    const invoker = tx ?? db;
    return this.instrumentation.startSpan(
      { name: "DrizzleRgpdRepository > findUsersReadyForWipe" },
      async () => {
        try {
          const query = invoker
            .select({
              userId: schema.user.id,
              email: schema.user.email,
              pendingDeletionUntil: schema.user.pendingDeletionUntil,
            })
            .from(schema.user)
            .where(
              and(lte(schema.user.pendingDeletionUntil, new Date()), isNull(schema.user.deletedAt)),
            )
            .limit(limit);
          const rows = (await this.instrumentation.startSpan(
            { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
            () => query.execute(),
          )) as PendingDeletionRow[];

          return Result.ok(rows);
        } catch (err) {
          this.instrumentation.capture(err);
          this.logger.error({ err, limit }, "RgpdRepository.findUsersReadyForWipe failed");
          return Result.fail(repositoryFailure(err, "findUsersReadyForWipe"));
        }
      },
    );
  }

  async executeWipe(
    userId: string,
    tx: ITransaction,
  ): Promise<Result<ExecuteWipeOutput, RgpdError>> {
    return this.instrumentation.startSpan(
      { name: "DrizzleRgpdRepository > executeWipe" },
      async () => {
        try {
          const userOrgRows = await tx
            .select({ id: schema.member.organizationId })
            .from(schema.member)
            .where(eq(schema.member.userId, userId));
          const userOrgIds = userOrgRows.map((r) => r.id);

          const anonymizedEmail = `deleted-${crypto.randomUUID()}@${ANONYMIZED_DOMAIN}`;
          await tx
            .update(schema.user)
            .set({
              email: anonymizedEmail,
              name: ANONYMIZED_NAME,
              image: null,
              emailVerified: false,
              twoFactorEnabled: false,
              pendingDeletionUntil: null,
              deletedAt: new Date(),
            })
            .where(eq(schema.user.id, userId));

          await tx.delete(schema.session).where(eq(schema.session.userId, userId));
          await tx.delete(schema.account).where(eq(schema.account.userId, userId));
          await tx.delete(schema.twoFactor).where(eq(schema.twoFactor.userId, userId));
          await tx.delete(schema.passkey).where(eq(schema.passkey.userId, userId));
          await tx.delete(schema.member).where(eq(schema.member.userId, userId));
          await tx.delete(schema.invitation).where(eq(schema.invitation.inviterId, userId));

          const deletedOrgs =
            userOrgIds.length === 0
              ? []
              : await tx
                  .delete(schema.organization)
                  .where(
                    and(
                      inArray(schema.organization.id, userOrgIds),
                      or(
                        like(schema.organization.slug, PERSONAL_ORG_SLUG_LIKE_PATTERN),
                        eq(
                          tx.$count(
                            schema.member,
                            eq(schema.member.organizationId, schema.organization.id),
                          ),
                          0,
                        ),
                      ),
                    ),
                  )
                  .returning({ id: schema.organization.id });

          return Result.ok({
            deletedOrgIds: deletedOrgs.map((o) => o.id),
            anonymizedEmail,
          });
        } catch (err) {
          this.instrumentation.capture(err);
          this.logger.error({ err, userId }, "RgpdRepository.executeWipe failed");
          return Result.fail(repositoryFailure(err, "executeWipe"));
        }
      },
    );
  }

  async verifyPassword(
    userId: string,
    password: string,
    tx?: ITransaction,
  ): Promise<Result<boolean, RgpdError>> {
    const invoker = tx ?? db;
    return this.instrumentation.startSpan(
      { name: "DrizzleRgpdRepository > verifyPassword" },
      async () => {
        try {
          const accQuery = invoker
            .select({ password: schema.account.password })
            .from(schema.account)
            .where(
              and(eq(schema.account.userId, userId), eq(schema.account.providerId, "credential")),
            )
            .limit(1);
          const [acc] = await this.instrumentation.startSpan(
            { name: accQuery.toSQL().sql, op: "db.query", attributes: dbAttrs },
            () => accQuery.execute(),
          );
          if (!acc?.password) return Result.ok(false);
          const ok = await verifyHash({ hash: acc.password, password });
          return Result.ok(ok);
        } catch (err) {
          this.instrumentation.capture(err);
          this.logger.error({ err, userId }, "RgpdRepository.verifyPassword failed");
          return Result.fail(repositoryFailure(err, "verifyPassword"));
        }
      },
    );
  }

  async verifyTotp(
    userId: string,
    code: string,
    tx?: ITransaction,
  ): Promise<Result<boolean, RgpdError>> {
    const invoker = tx ?? db;
    return this.instrumentation.startSpan(
      { name: "DrizzleRgpdRepository > verifyTotp" },
      async () => {
        try {
          const tfQuery = invoker
            .select({ secret: schema.twoFactor.secret })
            .from(schema.twoFactor)
            .where(eq(schema.twoFactor.userId, userId))
            .limit(1);
          const [tf] = await this.instrumentation.startSpan(
            { name: tfQuery.toSQL().sql, op: "db.query", attributes: dbAttrs },
            () => tfQuery.execute(),
          );
          if (!tf?.secret) return Result.ok(false);
          try {
            const decrypted = await symmetricDecrypt({
              key: env.BETTER_AUTH_SECRET,
              data: tf.secret,
            });
            const ok = await createOTP(decrypted, { period: 30, digits: 6 }).verify(code);
            return Result.ok(ok);
          } catch {
            return Result.ok(false);
          }
        } catch (err) {
          this.instrumentation.capture(err);
          this.logger.error({ err, userId }, "RgpdRepository.verifyTotp failed");
          return Result.fail(repositoryFailure(err, "verifyTotp"));
        }
      },
    );
  }

  async touchExportRequestedAt(
    userId: string,
    tx?: ITransaction,
  ): Promise<Result<void, RgpdError>> {
    const invoker = tx ?? db;
    return this.instrumentation.startSpan(
      { name: "DrizzleRgpdRepository > touchExportRequestedAt" },
      async () => {
        try {
          const query = invoker
            .update(schema.user)
            .set({ lastExportRequestedAt: new Date() })
            .where(eq(schema.user.id, userId));
          await this.instrumentation.startSpan(
            { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
            () => query.execute(),
          );
          return Result.ok();
        } catch (err) {
          this.instrumentation.capture(err);
          this.logger.error({ err, userId }, "RgpdRepository.touchExportRequestedAt failed");
          return Result.fail(repositoryFailure(err, "touchExportRequestedAt"));
        }
      },
    );
  }

  async getUserDeletionState(
    userId: string,
    tx?: ITransaction,
  ): Promise<Result<Option<UserDeletionState>, RgpdError>> {
    const invoker = tx ?? db;
    return this.instrumentation.startSpan(
      { name: "DrizzleRgpdRepository > getUserDeletionState" },
      async () => {
        try {
          const uQuery = invoker
            .select({
              email: schema.user.email,
              name: schema.user.name,
              twoFactorEnabled: schema.user.twoFactorEnabled,
              pendingDeletionUntil: schema.user.pendingDeletionUntil,
              deletedAt: schema.user.deletedAt,
              lastExportRequestedAt: schema.user.lastExportRequestedAt,
            })
            .from(schema.user)
            .where(eq(schema.user.id, userId))
            .limit(1);
          const [u] = await this.instrumentation.startSpan(
            { name: uQuery.toSQL().sql, op: "db.query", attributes: dbAttrs },
            () => uQuery.execute(),
          );
          if (!u) return Result.ok(Option.none());
          return Result.ok(
            Option.some({
              email: u.email,
              name: u.name,
              twoFactorEnabled: u.twoFactorEnabled ?? false,
              pendingDeletionUntil: Option.fromNullable(u.pendingDeletionUntil),
              deletedAt: Option.fromNullable(u.deletedAt),
              lastExportRequestedAt: Option.fromNullable(u.lastExportRequestedAt),
            }),
          );
        } catch (err) {
          this.instrumentation.capture(err);
          this.logger.error({ err, userId }, "RgpdRepository.getUserDeletionState failed");
          return Result.fail(repositoryFailure(err, "getUserDeletionState"));
        }
      },
    );
  }
}
