import {
  createDbFailure,
  type IInstrumentation,
  type ILogger,
  Option,
  Result,
} from "@packages/ddd-kit";
import {
  and,
  authSchema,
  count,
  desc,
  eq,
  ilike,
  multiTenantSchema,
  or,
  resolveExecutor,
} from "@packages/drizzle";
import { afterTimeIdCursor, exactInstant } from "@packages/http/time-id-cursor";
import type { ListOrgsInput } from "../../application/dto/list-orgs.dto";
import type {
  AdminOrgListRow,
  AdminOrgMemberRow,
  AdminOrgRow,
  IAdminOrgStore,
} from "../../application/ports/admin-org-store.port";
import type { AdminStoreError } from "../../application/ports/admin-user-store.port";

const dbAttrs = { "db.system.name": "postgresql" } as const;

// Built per call, not at import: schema columns are read lazily so a test that
// stands in for the drizzle package without them can still import this file.
function orgColumns() {
  const { organization, member } = multiTenantSchema;
  return {
    id: organization.id,
    name: organization.name,
    slug: organization.slug,
    createdAt: organization.createdAt,
    ssoEnforced: organization.ssoEnforced,
    memberCount: count(member.id),
  };
}

export class DrizzleAdminOrgStore implements IAdminOrgStore {
  private readonly fail;

  constructor(
    private readonly instrumentation: IInstrumentation,
    logger: ILogger,
  ) {
    this.fail = createDbFailure("ADMIN_QUERY_PROVIDER_FAILURE", logger);
  }

  async listOrgs(input: ListOrgsInput): Promise<Result<AdminOrgListRow[], AdminStoreError>> {
    const exec = resolveExecutor();

    return this.instrumentation.startSpan({ name: "DrizzleAdminOrgStore > listOrgs" }, async () => {
      try {
        const { organization, member } = multiTenantSchema;
        const conditions = [];
        if (input.search) {
          conditions.push(
            or(
              ilike(organization.name, `%${input.search}%`),
              ilike(organization.slug, `%${input.search}%`),
            ),
          );
        }
        if (input.cursor) {
          conditions.push(afterTimeIdCursor(organization.createdAt, organization.id, input.cursor));
        }

        const query = exec
          .select({ ...orgColumns(), cursorAt: exactInstant(organization.createdAt) })
          .from(organization)
          .leftJoin(member, eq(member.organizationId, organization.id))
          .where(conditions.length ? and(...conditions) : undefined)
          .groupBy(organization.id)
          .orderBy(desc(organization.createdAt), desc(organization.id))
          .limit(input.limit);

        const rows = await this.instrumentation.startSpan(
          { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
          () => query.execute(),
        );

        return Result.ok(rows);
      } catch (err) {
        this.instrumentation.capture(err);
        return this.fail(err, "admin organization list failed");
      }
    });
  }

  async findOrgById(id: string): Promise<Result<Option<AdminOrgRow>, AdminStoreError>> {
    const exec = resolveExecutor();

    return this.instrumentation.startSpan(
      { name: "DrizzleAdminOrgStore > findOrgById" },
      async () => {
        try {
          const { organization, member } = multiTenantSchema;
          const query = exec
            .select(orgColumns())
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
          return this.fail(err, "admin organization lookup failed");
        }
      },
    );
  }

  async listMembersOf(
    organizationId: string,
  ): Promise<Result<AdminOrgMemberRow[], AdminStoreError>> {
    const exec = resolveExecutor();

    return this.instrumentation.startSpan(
      { name: "DrizzleAdminOrgStore > listMembersOf" },
      async () => {
        try {
          const { member } = multiTenantSchema;
          const query = exec
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
          return this.fail(err, "admin organization member list failed");
        }
      },
    );
  }
}
