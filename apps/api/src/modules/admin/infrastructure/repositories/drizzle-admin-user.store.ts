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
} from "@packages/drizzle";
import { createDbFailure } from "../../../../shared/db-failure";
import type { IInstrumentation } from "../../../../shared/ports/instrumentation.port";
import type { ListUsersInput } from "../../application/dto/list-users.dto";
import type {
  AdminMembershipRow,
  AdminSessionRow,
  AdminStoreError,
  AdminUserRow,
  IAdminUserStore,
} from "../../application/ports/admin-user-store.port";

const user = authSchema.user;
const session = authSchema.session;
const member = multiTenantSchema.member;
const organization = multiTenantSchema.organization;
const fail = createDbFailure("ADMIN_QUERY_PROVIDER_FAILURE");
const dbAttrs = { "db.system.name": "postgresql" } as const;

const userColumns = {
  id: user.id,
  email: user.email,
  name: user.name,
  role: user.role,
  banned: user.banned,
  banReason: user.banReason,
  banExpires: user.banExpires,
  twoFactorEnabled: user.twoFactorEnabled,
  createdAt: user.createdAt,
};

type UserSelection = Pick<typeof user.$inferSelect, keyof typeof userColumns>;

type SessionSelection = Pick<
  typeof session.$inferSelect,
  "id" | "createdAt" | "expiresAt" | "ipAddress" | "userAgent" | "impersonatedBy"
>;

function toUserRow(row: UserSelection): AdminUserRow {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: Option.fromNullable(row.role),
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
          const conditions = [];
          if (input.search) {
            conditions.push(
              or(ilike(user.email, `%${input.search}%`), ilike(user.name, `%${input.search}%`)),
            );
          }
          if (input.role) conditions.push(eq(user.role, input.role));
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
            .select(userColumns)
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
          const query = db.select(userColumns).from(user).where(eq(user.id, id)).limit(1);

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
}
