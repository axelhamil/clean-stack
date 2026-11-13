import { type IInstrumentation, Result } from "@packages/ddd-kit";
import { dbOperationFailure, desc, eq, resolveExecutor } from "@packages/drizzle";
import * as policiesSchema from "../../../schemas/policies";
import type { PolicyError } from "../../application/ports/repositories/policy-acceptance.port";
import type {
  IPolicyStatusQuery,
  PolicyStatusInput,
} from "../../application/queries/policy-status.query";
import {
  type AcceptedVersions,
  type PolicyStatus,
  policyStatusFrom,
} from "../../application/services/policy-status.service";

const pa = policiesSchema.policyAcceptance;
const dbAttrs = { "db.system.name": "postgresql" } as const;

const queryFailure = dbOperationFailure("POLICY_ACCEPTANCE_PROVIDER_FAILURE");

export class DrizzlePolicyStatusQuery implements IPolicyStatusQuery {
  constructor(private readonly instrumentation: IInstrumentation) {}

  async execute({ userId }: PolicyStatusInput): Promise<Result<PolicyStatus, PolicyError>> {
    const exec = resolveExecutor();

    return this.instrumentation.startSpan(
      { name: "DrizzlePolicyStatusQuery > execute" },
      async () => {
        try {
          const query = exec
            .select({ policyType: pa.policyType, policyVersion: pa.policyVersion })
            .from(pa)
            .where(eq(pa.userId, userId))
            .orderBy(desc(pa.acceptedAt));

          const rows = await this.instrumentation.startSpan(
            { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
            () => query.execute(),
          );

          const latest: AcceptedVersions = {};
          for (const row of rows) {
            if (!(row.policyType in latest)) latest[row.policyType] = row.policyVersion;
          }

          return Result.ok(policyStatusFrom(latest));
        } catch (err) {
          this.instrumentation.capture(err);
          return Result.fail(queryFailure("findLatestVersions"));
        }
      },
    );
  }
}
