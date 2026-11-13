import { PERSONAL_ORG_SLUG_LIKE_PATTERN } from "@packages/access-control";
import { type IInstrumentation, type ILogger, Result } from "@packages/ddd-kit";
import {
  and,
  dbOperationFailure,
  eq,
  gt,
  like,
  not,
  resolveExecutor,
  schema,
} from "@packages/drizzle";
import type { RgpdError } from "../../application/ports/repositories/deletion-state.port";
import type {
  IPreflightAccountDeletionQuery,
  PreflightAccountDeletionInput,
  PreflightAccountDeletionOutput,
} from "../../application/queries/preflight-account-deletion.query";

const dbAttrs = { "db.system.name": "postgresql" } as const;

const queryFailure = dbOperationFailure("RGPD_REPOSITORY_PROVIDER_FAILURE");

export class DrizzlePreflightAccountDeletionQuery implements IPreflightAccountDeletionQuery {
  constructor(
    private readonly logger: ILogger,
    private readonly instrumentation: IInstrumentation,
  ) {}

  async execute(
    input: PreflightAccountDeletionInput,
  ): Promise<Result<PreflightAccountDeletionOutput, RgpdError>> {
    const exec = resolveExecutor();
    return this.instrumentation.startSpan(
      { name: "DrizzlePreflightAccountDeletionQuery > execute" },
      async () => {
        try {
          const membersOf = eq(schema.member.organizationId, schema.organization.id);
          const query = exec
            .select({
              orgId: schema.organization.id,
              orgName: schema.organization.name,
              memberCount: exec.$count(schema.member, membersOf),
            })
            .from(schema.member)
            .innerJoin(
              schema.organization,
              eq(schema.member.organizationId, schema.organization.id),
            )
            .where(
              and(
                eq(schema.member.userId, input.userId),
                eq(schema.member.role, "owner"),
                not(like(schema.organization.slug, PERSONAL_ORG_SLUG_LIKE_PATTERN)),
                eq(exec.$count(schema.member, and(membersOf, eq(schema.member.role, "owner"))), 1),
                gt(exec.$count(schema.member, membersOf), 1),
              ),
            );
          const rows = await this.instrumentation.startSpan(
            { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
            () => query.execute(),
          );

          return Result.ok({
            blockingOrgs: rows.map((r) => ({
              orgId: r.orgId,
              orgName: r.orgName,
              otherMembersCount: r.memberCount - 1,
            })),
          });
        } catch (err) {
          this.instrumentation.capture(err);
          this.logger.error(
            { err, userId: input.userId },
            "PreflightAccountDeletionQuery.execute failed",
          );
          return Result.fail(queryFailure("findSoleOwnedNonPersonalOrgsWithMembers"));
        }
      },
    );
  }
}
