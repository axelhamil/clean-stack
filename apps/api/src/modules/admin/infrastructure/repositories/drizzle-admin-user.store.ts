import { type IInstrumentation, Option, Result } from "@packages/ddd-kit";
import {
  and,
  authSchema,
  desc,
  eq,
  gt,
  ilike,
  inArray,
  isNull,
  lte,
  multiTenantSchema,
  or,
  resolveExecutor,
} from "@packages/drizzle";
import { afterTimeIdCursor, exactInstant } from "@packages/http/time-id-cursor";
import { ENDED_SESSION_COLUMNS, endedSessionsOf } from "../../../../shared/db/ended-sessions";
import { createDbFailure } from "../../../../shared/db-failure";
import type { EndedSessions } from "../../../../shared/ports/staff-store.port";
import type { ListUsersInput } from "../../application/dto/list-users.dto";
import type {
  AdminMembershipRow,
  AdminSessionRow,
  AdminStoreError,
  AdminUserListRow,
  AdminUserRow,
  BanWrite,
  IAdminUserStore,
  UnbanOutcome,
} from "../../application/ports/admin-user-store.port";

const fail = createDbFailure("ADMIN_QUERY_PROVIDER_FAILURE");
const dbAttrs = { "db.system.name": "postgresql" } as const;

// Built per call, not at import: schema columns are read lazily so a test that
// stands in for the drizzle package without them can still import this file.
function userColumns() {
  const { user } = authSchema;
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    banned: user.banned,
    banReason: user.banReason,
    banExpires: user.banExpires,
    twoFactorEnabled: user.twoFactorEnabled,
    createdAt: user.createdAt,
  };
}

type UserSelection = Pick<
  typeof authSchema.user.$inferSelect,
  keyof ReturnType<typeof userColumns>
>;

type SessionSelection = Pick<
  typeof authSchema.session.$inferSelect,
  "id" | "createdAt" | "expiresAt" | "ipAddress" | "userAgent" | "impersonatedBy"
>;

function toUserRow(row: UserSelection): AdminUserRow {
  const isBanOver = row.banExpires !== null && row.banExpires.getTime() <= Date.now();
  const isBanned = row.banned === true && !isBanOver;

  return {
    id: row.id,
    email: row.email,
    name: row.name,
    banned: isBanned,
    banReason: Option.fromNullable(isBanned ? row.banReason : null),
    banExpires: Option.fromNullable(isBanned ? row.banExpires : null),
    twoFactorEnabled: row.twoFactorEnabled === true,
    createdAt: row.createdAt,
  };
}

function toSessionRow(row: SessionSelection): AdminSessionRow {
  return {
    id: row.id,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
    ipAddress: Option.fromNullable(row.ipAddress),
    userAgent: Option.fromNullable(row.userAgent),
    impersonatedBy: Option.fromNullable(row.impersonatedBy),
  };
}

function liveBanIs(banned: boolean) {
  const { user } = authSchema;
  const now = new Date();

  return banned
    ? and(eq(user.banned, true), or(isNull(user.banExpires), gt(user.banExpires, now)))
    : or(isNull(user.banned), eq(user.banned, false), lte(user.banExpires, now));
}

function sessionsHeldOrImpersonatedBy(userId: string) {
  const { session } = authSchema;

  return or(eq(session.userId, userId), eq(session.impersonatedBy, userId));
}

export class DrizzleAdminUserStore implements IAdminUserStore {
  constructor(private readonly instrumentation: IInstrumentation) {}

  async listUsers(input: ListUsersInput): Promise<Result<AdminUserListRow[], AdminStoreError>> {
    const exec = resolveExecutor();

    return this.instrumentation.startSpan(
      { name: "DrizzleAdminUserStore > listUsers" },
      async () => {
        try {
          const { user } = authSchema;
          const { member } = multiTenantSchema;
          const conditions = [];
          if (input.search) {
            conditions.push(
              or(ilike(user.email, `%${input.search}%`), ilike(user.name, `%${input.search}%`)),
            );
          }
          if (input.banned !== undefined) conditions.push(liveBanIs(input.banned));
          if (input.cursor) {
            conditions.push(afterTimeIdCursor(user.createdAt, user.id, input.cursor));
          }
          if (input.organizationId) {
            conditions.push(
              inArray(
                user.id,
                exec
                  .select({ userId: member.userId })
                  .from(member)
                  .where(eq(member.organizationId, input.organizationId)),
              ),
            );
          }

          const query = exec
            .select({ ...userColumns(), cursorAt: exactInstant(user.createdAt) })
            .from(user)
            .where(conditions.length ? and(...conditions) : undefined)
            .orderBy(desc(user.createdAt), desc(user.id))
            .limit(input.limit);

          const rows = await this.instrumentation.startSpan(
            { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
            () => query.execute(),
          );

          return Result.ok(rows.map((row) => ({ ...toUserRow(row), cursorAt: row.cursorAt })));
        } catch (err) {
          this.instrumentation.capture(err);
          return fail(err, "admin user list failed");
        }
      },
    );
  }

  async findUserById(id: string): Promise<Result<Option<AdminUserRow>, AdminStoreError>> {
    const exec = resolveExecutor();

    return this.instrumentation.startSpan(
      { name: "DrizzleAdminUserStore > findUserById" },
      async () => {
        try {
          const { user } = authSchema;
          const query = exec.select(userColumns()).from(user).where(eq(user.id, id)).limit(1);

          const [row] = await this.instrumentation.startSpan(
            { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
            () => query.execute(),
          );

          return Result.ok(Option.fromNullable(row).map(toUserRow));
        } catch (err) {
          this.instrumentation.capture(err);
          return fail(err, "admin user lookup failed");
        }
      },
    );
  }

  async listSessionsFor(userId: string): Promise<Result<AdminSessionRow[], AdminStoreError>> {
    const exec = resolveExecutor();

    return this.instrumentation.startSpan(
      { name: "DrizzleAdminUserStore > listSessionsFor" },
      async () => {
        try {
          const { session } = authSchema;
          const query = exec
            .select({
              id: session.id,
              createdAt: session.createdAt,
              expiresAt: session.expiresAt,
              ipAddress: session.ipAddress,
              userAgent: session.userAgent,
              impersonatedBy: session.impersonatedBy,
            })
            .from(session)
            .where(eq(session.userId, userId))
            .orderBy(desc(session.createdAt));

          const rows = await this.instrumentation.startSpan(
            { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
            () => query.execute(),
          );

          return Result.ok(rows.map(toSessionRow));
        } catch (err) {
          this.instrumentation.capture(err);
          return fail(err, "admin session list failed");
        }
      },
    );
  }

  async listMembershipsFor(userId: string): Promise<Result<AdminMembershipRow[], AdminStoreError>> {
    const exec = resolveExecutor();

    return this.instrumentation.startSpan(
      { name: "DrizzleAdminUserStore > listMembershipsFor" },
      async () => {
        try {
          const { member, organization } = multiTenantSchema;
          const query = exec
            .select({
              organizationId: member.organizationId,
              organizationName: organization.name,
              role: member.role,
            })
            .from(member)
            .innerJoin(organization, eq(member.organizationId, organization.id))
            .where(eq(member.userId, userId));

          const rows = await this.instrumentation.startSpan(
            { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
            () => query.execute(),
          );

          return Result.ok(rows);
        } catch (err) {
          this.instrumentation.capture(err);
          return fail(err, "admin membership list failed");
        }
      },
    );
  }

  async ban(input: BanWrite): Promise<Result<Option<EndedSessions>, AdminStoreError>> {
    const exec = resolveExecutor();

    return this.instrumentation.startSpan({ name: "DrizzleAdminUserStore > ban" }, async () => {
      try {
        const { session, user } = authSchema;
        const written = await exec
          .update(user)
          .set({
            banned: true,
            banReason: input.reason,
            banExpires: input.expiresAt.toNull(),
            updatedAt: new Date(),
          })
          .where(eq(user.id, input.userId))
          .returning({ id: user.id });
        if (written.length === 0) return Result.ok(Option.none());

        const ended = await exec
          .delete(session)
          .where(sessionsHeldOrImpersonatedBy(input.userId))
          .returning(ENDED_SESSION_COLUMNS);

        return Result.ok(Option.some(endedSessionsOf(ended)));
      } catch (err) {
        this.instrumentation.capture(err);
        return fail(err, "admin ban failed");
      }
    });
  }

  async unban(userId: string): Promise<Result<UnbanOutcome, AdminStoreError>> {
    const exec = resolveExecutor();

    return this.instrumentation.startSpan({ name: "DrizzleAdminUserStore > unban" }, async () => {
      try {
        const { user } = authSchema;
        const written = await exec
          .update(user)
          .set({ banned: false, banReason: null, banExpires: null, updatedAt: new Date() })
          .where(and(eq(user.id, userId), eq(user.banned, true)))
          .returning({ id: user.id });
        if (written.length > 0) return Result.ok("unbanned");

        const [existing] = await exec
          .select({ id: user.id })
          .from(user)
          .where(eq(user.id, userId))
          .limit(1);

        return Result.ok(existing ? "not_banned" : "not_found");
      } catch (err) {
        this.instrumentation.capture(err);
        return fail(err, "admin unban failed");
      }
    });
  }

  async deleteSessions(userId: string): Promise<Result<EndedSessions, AdminStoreError>> {
    const exec = resolveExecutor();

    return this.instrumentation.startSpan(
      { name: "DrizzleAdminUserStore > deleteSessions" },
      async () => {
        try {
          const { session } = authSchema;
          const query = exec
            .delete(session)
            .where(sessionsHeldOrImpersonatedBy(userId))
            .returning(ENDED_SESSION_COLUMNS);
          const ended = await this.instrumentation.startSpan(
            { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
            () => query.execute(),
          );

          return Result.ok(endedSessionsOf(ended));
        } catch (err) {
          this.instrumentation.capture(err);
          return fail(err, "admin session deletion failed");
        }
      },
    );
  }
}
