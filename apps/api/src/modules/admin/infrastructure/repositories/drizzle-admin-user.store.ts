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
import type { IInstrumentation } from "../../../../shared/ports/instrumentation.port";
import type { ListUsersInput } from "../../application/dto/list-users.dto";
import type {
  AdminMembershipRow,
  AdminSessionRow,
  AdminUserRow,
  IAdminUserStore,
} from "../../application/ports/admin-user-store.port";

export class DrizzleAdminUserStore implements IAdminUserStore {
  constructor(private readonly instrumentation: IInstrumentation) {}

  async listUsers(input: ListUsersInput): Promise<AdminUserRow[]> {
    try {
      return await this.instrumentation.startSpan(
        { name: "DrizzleAdminUserStore > listUsers" },
        async () => {
          const conditions = [];
          if (input.search) {
            conditions.push(
              or(
                ilike(authSchema.user.email, `%${input.search}%`),
                ilike(authSchema.user.name, `%${input.search}%`),
              ),
            );
          }
          if (input.role) conditions.push(eq(authSchema.user.role, input.role));
          if (input.banned !== undefined) conditions.push(eq(authSchema.user.banned, input.banned));
          if (input.cursor) conditions.push(lt(authSchema.user.createdAt, new Date(input.cursor)));
          if (input.organizationId) {
            conditions.push(
              inArray(
                authSchema.user.id,
                db
                  .select({ userId: multiTenantSchema.member.userId })
                  .from(multiTenantSchema.member)
                  .where(eq(multiTenantSchema.member.organizationId, input.organizationId)),
              ),
            );
          }

          const query = db
            .select({
              id: authSchema.user.id,
              email: authSchema.user.email,
              name: authSchema.user.name,
              role: authSchema.user.role,
              banned: authSchema.user.banned,
              banReason: authSchema.user.banReason,
              banExpires: authSchema.user.banExpires,
              twoFactorEnabled: authSchema.user.twoFactorEnabled,
              createdAt: authSchema.user.createdAt,
            })
            .from(authSchema.user)
            .where(conditions.length ? and(...conditions) : undefined)
            .orderBy(desc(authSchema.user.createdAt))
            .limit(input.limit);

          return this.instrumentation.startSpan(
            {
              name: query.toSQL().sql,
              op: "db.query",
              attributes: { "db.system.name": "postgresql" },
            },
            () => query.execute(),
          );
        },
      );
    } catch (err) {
      this.instrumentation.capture(err);
      throw err;
    }
  }

  async findUserById(id: string): Promise<AdminUserRow | null> {
    try {
      return await this.instrumentation.startSpan(
        { name: "DrizzleAdminUserStore > findUserById" },
        async () => {
          const query = db
            .select({
              id: authSchema.user.id,
              email: authSchema.user.email,
              name: authSchema.user.name,
              role: authSchema.user.role,
              banned: authSchema.user.banned,
              banReason: authSchema.user.banReason,
              banExpires: authSchema.user.banExpires,
              twoFactorEnabled: authSchema.user.twoFactorEnabled,
              createdAt: authSchema.user.createdAt,
            })
            .from(authSchema.user)
            .where(eq(authSchema.user.id, id))
            .limit(1);

          const rows = await this.instrumentation.startSpan(
            {
              name: query.toSQL().sql,
              op: "db.query",
              attributes: { "db.system.name": "postgresql" },
            },
            () => query.execute(),
          );
          return rows[0] ?? null;
        },
      );
    } catch (err) {
      this.instrumentation.capture(err);
      throw err;
    }
  }

  async listSessionsFor(userId: string): Promise<AdminSessionRow[]> {
    try {
      return await this.instrumentation.startSpan(
        { name: "DrizzleAdminUserStore > listSessionsFor" },
        async () => {
          const query = db
            .select({
              id: authSchema.session.id,
              createdAt: authSchema.session.createdAt,
              expiresAt: authSchema.session.expiresAt,
              ipAddress: authSchema.session.ipAddress,
              userAgent: authSchema.session.userAgent,
              impersonatedBy: authSchema.session.impersonatedBy,
            })
            .from(authSchema.session)
            .where(eq(authSchema.session.userId, userId))
            .orderBy(desc(authSchema.session.createdAt));

          return this.instrumentation.startSpan(
            {
              name: query.toSQL().sql,
              op: "db.query",
              attributes: { "db.system.name": "postgresql" },
            },
            () => query.execute(),
          );
        },
      );
    } catch (err) {
      this.instrumentation.capture(err);
      throw err;
    }
  }

  async listMembershipsFor(userId: string): Promise<AdminMembershipRow[]> {
    try {
      return await this.instrumentation.startSpan(
        { name: "DrizzleAdminUserStore > listMembershipsFor" },
        async () => {
          const query = db
            .select({
              organizationId: multiTenantSchema.member.organizationId,
              organizationName: multiTenantSchema.organization.name,
              role: multiTenantSchema.member.role,
            })
            .from(multiTenantSchema.member)
            .innerJoin(
              multiTenantSchema.organization,
              eq(multiTenantSchema.member.organizationId, multiTenantSchema.organization.id),
            )
            .where(eq(multiTenantSchema.member.userId, userId));

          return this.instrumentation.startSpan(
            {
              name: query.toSQL().sql,
              op: "db.query",
              attributes: { "db.system.name": "postgresql" },
            },
            () => query.execute(),
          );
        },
      );
    } catch (err) {
      this.instrumentation.capture(err);
      throw err;
    }
  }
}
