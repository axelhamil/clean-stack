import { Option } from "@packages/ddd-kit";
import {
  and,
  authSchema,
  billingSchema,
  count,
  db,
  desc,
  eq,
  ilike,
  lt,
  multiTenantSchema,
  or,
  sql,
} from "@packages/drizzle";
import type { IInstrumentation } from "../../../../shared/ports/instrumentation.port";
import type { ListOrgsInput } from "../../application/dto/list-orgs.dto";
import type {
  AdminOrgMemberRow,
  AdminOrgRow,
  IAdminOrgStore,
} from "../../application/ports/admin-org-store.port";

export class DrizzleAdminOrgStore implements IAdminOrgStore {
  constructor(private readonly instrumentation: IInstrumentation) {}

  async listOrgs(input: ListOrgsInput): Promise<AdminOrgRow[]> {
    try {
      return await this.instrumentation.startSpan(
        { name: "DrizzleAdminOrgStore > listOrgs" },
        async () => {
          const conditions = [];
          if (input.search) {
            conditions.push(
              or(
                ilike(multiTenantSchema.organization.name, `%${input.search}%`),
                ilike(multiTenantSchema.organization.slug, `%${input.search}%`),
              ),
            );
          }
          if (input.cursor) {
            conditions.push(lt(multiTenantSchema.organization.createdAt, new Date(input.cursor)));
          }

          const query = db
            .select({
              id: multiTenantSchema.organization.id,
              name: multiTenantSchema.organization.name,
              slug: multiTenantSchema.organization.slug,
              createdAt: multiTenantSchema.organization.createdAt,
              memberCount: count(multiTenantSchema.member.id),
            })
            .from(multiTenantSchema.organization)
            .leftJoin(
              multiTenantSchema.member,
              eq(multiTenantSchema.member.organizationId, multiTenantSchema.organization.id),
            )
            .where(conditions.length ? and(...conditions) : undefined)
            .groupBy(multiTenantSchema.organization.id)
            .orderBy(desc(multiTenantSchema.organization.createdAt))
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

  async findOrgById(id: string): Promise<Option<AdminOrgRow>> {
    try {
      return await this.instrumentation.startSpan(
        { name: "DrizzleAdminOrgStore > findOrgById" },
        async () => {
          const query = db
            .select({
              id: multiTenantSchema.organization.id,
              name: multiTenantSchema.organization.name,
              slug: multiTenantSchema.organization.slug,
              createdAt: multiTenantSchema.organization.createdAt,
              memberCount: count(multiTenantSchema.member.id),
            })
            .from(multiTenantSchema.organization)
            .leftJoin(
              multiTenantSchema.member,
              eq(multiTenantSchema.member.organizationId, multiTenantSchema.organization.id),
            )
            .where(eq(multiTenantSchema.organization.id, id))
            .groupBy(multiTenantSchema.organization.id)
            .limit(1);

          const rows = await this.instrumentation.startSpan(
            {
              name: query.toSQL().sql,
              op: "db.query",
              attributes: { "db.system.name": "postgresql" },
            },
            () => query.execute(),
          );
          return Option.fromNullable(rows[0] ?? null);
        },
      );
    } catch (err) {
      this.instrumentation.capture(err);
      throw err;
    }
  }

  async listMembersOf(organizationId: string): Promise<AdminOrgMemberRow[]> {
    try {
      return await this.instrumentation.startSpan(
        { name: "DrizzleAdminOrgStore > listMembersOf" },
        async () => {
          const query = db
            .select({
              userId: multiTenantSchema.member.userId,
              email: authSchema.user.email,
              role: multiTenantSchema.member.role,
            })
            .from(multiTenantSchema.member)
            .innerJoin(authSchema.user, eq(authSchema.user.id, multiTenantSchema.member.userId))
            .where(eq(multiTenantSchema.member.organizationId, organizationId));

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

  async findPlanFor(organizationId: string): Promise<Option<string>> {
    try {
      return await this.instrumentation.startSpan(
        { name: "DrizzleAdminOrgStore > findPlanFor" },
        async () => {
          const query = db
            .select({ plan: billingSchema.subscription.plan })
            .from(billingSchema.subscription)
            .where(eq(billingSchema.subscription.referenceId, organizationId))
            .orderBy(sql`${billingSchema.subscription.periodStart} DESC NULLS LAST`)
            .limit(1);

          const rows = await this.instrumentation.startSpan(
            {
              name: query.toSQL().sql,
              op: "db.query",
              attributes: { "db.system.name": "postgresql" },
            },
            () => query.execute(),
          );
          return Option.fromNullable(rows[0]?.plan ?? null);
        },
      );
    } catch (err) {
      this.instrumentation.capture(err);
      throw err;
    }
  }
}
