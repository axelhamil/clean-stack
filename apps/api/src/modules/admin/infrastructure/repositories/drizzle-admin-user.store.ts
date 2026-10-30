import { Option, Result } from "@packages/ddd-kit";
import {
  and,
  authSchema,
  db,
  desc,
  eq,
  ilike,
  inArray,
  lt,
  multiTenantSchema,
  or,
  resolveExecutor,
} from "@packages/drizzle";
import { createDbFailure } from "../../../../shared/db-failure";
import type { IInstrumentation } from "../../../../shared/ports/instrumentation.port";
import type { ListUsersInput } from "../../application/dto/list-users.dto";
import type {
  AdminMembershipRow,
  AdminSessionRow,
  AdminStoreError,
  AdminUserRow,
  BanWrite,
  EndedSession,
  IAdminUserStore,
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
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    banned: row.banned === true,
    banReason: Option.fromNullable(row.banReason),
    banExpires: Option.fromNullable(row.banExpires),
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

export class DrizzleAdminUserStore implements IAdminUserStore {
  constructor(private readonly instrumentation: IInstrumentation) {}

  async listUsers(input: ListUsersInput): Promise<Result<AdminUserRow[], AdminStoreError>> {
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
          if (input.banned !== undefined) conditions.push(eq(user.banned, input.banned));
          if (input.cursor) conditions.push(lt(user.createdAt, new Date(input.cursor)));
          if (input.organizationId) {
            conditions.push(
              inArray(
                user.id,
                db
                  .select({ userId: member.userId })
                  .from(member)
                  .where(eq(member.organizationId, input.organizationId)),
              ),
            );
          }

          const query = db
            .select(userColumns())
            .from(user)
            .where(conditions.length ? and(...conditions) : undefined)
            .orderBy(desc(user.createdAt))
            .limit(input.limit);

          const rows = await this.instrumentation.startSpan(
            { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
            () => query.execute(),
          );

          return Result.ok(rows.map(toUserRow));
        } catch (err) {
          this.instrumentation.capture(err);
          return fail(err, "admin user list failed");
        }
      },
    );
  }

  async findUserById(id: string): Promise<Result<Option<AdminUserRow>, AdminStoreError>> {
    return this.instrumentation.startSpan(
      { name: "DrizzleAdminUserStore > findUserById" },
      async () => {
        try {
          const { user } = authSchema;
          const query = db.select(userColumns()).from(user).where(eq(user.id, id)).limit(1);

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
    return this.instrumentation.startSpan(
      { name: "DrizzleAdminUserStore > listSessionsFor" },
      async () => {
        try {
          const { session } = authSchema;
          const query = db
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
    return this.instrumentation.startSpan(
      { name: "DrizzleAdminUserStore > listMembershipsFor" },
      async () => {
        try {
          const { member, organization } = multiTenantSchema;
          const query = db
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

  async ban(input: BanWrite): Promise<Result<Option<EndedSession[]>, AdminStoreError>> {
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
          .where(or(eq(session.userId, input.userId), eq(session.impersonatedBy, input.userId)))
          .returning({ id: session.id, userId: session.userId });

        return Result.ok(Option.some(ended));
      } catch (err) {
        this.instrumentation.capture(err);
        return fail(err, "admin ban failed");
      }
    });
  }

  async unban(userId: string): Promise<Result<boolean, AdminStoreError>> {
    const exec = resolveExecutor();

    return this.instrumentation.startSpan({ name: "DrizzleAdminUserStore > unban" }, async () => {
      try {
        const { user } = authSchema;
        const query = exec
          .update(user)
          .set({ banned: false, banReason: null, banExpires: null, updatedAt: new Date() })
          .where(eq(user.id, userId))
          .returning({ id: user.id });
        const written = await this.instrumentation.startSpan(
          { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
          () => query.execute(),
        );

        return Result.ok(written.length > 0);
      } catch (err) {
        this.instrumentation.capture(err);
        return fail(err, "admin unban failed");
      }
    });
  }

  async deleteSessions(userId: string): Promise<Result<EndedSession[], AdminStoreError>> {
    const exec = resolveExecutor();

    return this.instrumentation.startSpan(
      { name: "DrizzleAdminUserStore > deleteSessions" },
      async () => {
        try {
          const { session } = authSchema;
          const query = exec
            .delete(session)
            .where(eq(session.userId, userId))
            .returning({ id: session.id, userId: session.userId });
          const ended = await this.instrumentation.startSpan(
            { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
            () => query.execute(),
          );

          return Result.ok(ended);
        } catch (err) {
          this.instrumentation.capture(err);
          return fail(err, "admin session deletion failed");
        }
      },
    );
  }
}
