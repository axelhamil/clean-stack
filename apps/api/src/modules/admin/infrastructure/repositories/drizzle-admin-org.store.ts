import { Option, Result } from "@packages/ddd-kit";
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
import { createDbFailure } from "../../../../shared/db-failure";
import type { IInstrumentation } from "../../../../shared/ports/instrumentation.port";
import type { ListOrgsInput } from "../../application/dto/list-orgs.dto";
import type {
  AdminOrgMemberRow,
  AdminOrgRow,
  IAdminOrgStore,
} from "../../application/ports/admin-org-store.port";
import type { AdminStoreError } from "../../application/ports/admin-user-store.port";

const organization = multiTenantSchema.organization;
const member = multiTenantSchema.member;
const subscription = billingSchema.subscription;
const fail = createDbFailure("ADMIN_QUERY_PROVIDER_FAILURE");
const dbAttrs = { "db.system.name": "postgresql" } as const;

const orgColumns = {
  id: organization.id,
  name: organization.name,
  slug: organization.slug,
  createdAt: organization.createdAt,
  ssoEnforced: organization.ssoEnforced,
  memberCount: count(member.id),
};

export class DrizzleAdminOrgStore implements IAdminOrgStore {
  constructor(private readonly instrumentation: IInstrumentation) {}

  async listOrgs(input: ListOrgsInput): Promise<Result<AdminOrgRow[], AdminStoreError>> {
    return this.instrumentation.startSpan({ name: "DrizzleAdminOrgStore > listOrgs" }, async () => {
      try {
        const conditions = [];
        if (input.search) {
          conditions.push(
            or(
              ilike(organization.name, `%${input.search}%`),
              ilike(organization.slug, `%${input.search}%`),
            ),
          );
        }
        if (input.cursor) conditions.push(lt(organization.createdAt, new Date(input.cursor)));

        const query = db
          .select(orgColumns)
          .from(organization)
          .leftJoin(member, eq(member.organizationId, organization.id))
          .where(conditions.length ? and(...conditions) : undefined)
          .groupBy(organization.id)
          .orderBy(desc(organization.createdAt))
          .limit(input.limit);

        const rows = await this.instrumentation.startSpan(
          { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
          () => query.execute(),
        );

        return Result.ok(rows);
      } catch (err) {
        this.instrumentation.capture(err);
        return fail(err, "admin organization list failed");
      }
    });
  }

  async findOrgById(id: string): Promise<Result<Option<AdminOrgRow>, AdminStoreError>> {
    return this.instrumentation.startSpan(
      { name: "DrizzleAdminOrgStore > findOrgById" },
      async () => {
        try {
          const query = db
            .select(orgColumns)
            .from(organization)
            .leftJoin(member, eq(member.organizationId, organization.id))
            .where(eq(organization.id, id))
            .groupBy(organization.id)
            .limit(1);

          const [row] = await this.instrumentation.startSpan(
            { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
            () => query.execute(),
          );

          return Result.ok(Option.fromNullable(row));
        } catch (err) {
          this.instrumentation.capture(err);
          return fail(err, "admin organization lookup failed");
        }
      },
    );
  }

  async listMembersOf(
    organizationId: string,
  ): Promise<Result<AdminOrgMemberRow[], AdminStoreError>> {
    return this.instrumentation.startSpan(
      { name: "DrizzleAdminOrgStore > listMembersOf" },
      async () => {
        try {
          const query = db
            .select({
              userId: member.userId,
              email: authSchema.user.email,
              role: member.role,
            })
            .from(member)
            .innerJoin(authSchema.user, eq(authSchema.user.id, member.userId))
            .where(eq(member.organizationId, organizationId));

          const rows = await this.instrumentation.startSpan(
            { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
            () => query.execute(),
          );

          return Result.ok(rows);
        } catch (err) {
          this.instrumentation.capture(err);
          return fail(err, "admin organization member list failed");
        }
      },
    );
  }

  async findPlanFor(organizationId: string): Promise<Result<Option<string>, AdminStoreError>> {
    return this.instrumentation.startSpan(
      { name: "DrizzleAdminOrgStore > findPlanFor" },
      async () => {
        try {
          const query = db
            .select({ plan: subscription.plan })
            .from(subscription)
            .where(eq(subscription.referenceId, organizationId))
            .orderBy(sql`${subscription.periodStart} DESC NULLS LAST`)
            .limit(1);

          const [row] = await this.instrumentation.startSpan(
            { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
            () => query.execute(),
          );

          return Result.ok(Option.fromNullable(row?.plan));
        } catch (err) {
          this.instrumentation.capture(err);
          return fail(err, "admin organization plan lookup failed");
        }
      },
    );
  }
}
