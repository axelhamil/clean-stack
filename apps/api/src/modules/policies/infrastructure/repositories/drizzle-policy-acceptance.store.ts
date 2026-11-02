import { Result } from "@packages/ddd-kit";
import { desc, eq, policiesSchema, resolveExecutor } from "@packages/drizzle";
import type { PolicyType } from "@packages/policies";
import { dbOperationFailure } from "../../../../shared/db-failure";
import type { IInstrumentation } from "../../../../shared/ports/instrumentation.port";
import type {
  IPolicyAcceptanceStore,
  PolicyAcceptanceRecord,
  PolicyError,
} from "../../application/ports/policy-acceptance.port";

const pa = policiesSchema.policyAcceptance;
const dbAttrs = { "db.system.name": "postgresql" } as const;

const storeFailure = dbOperationFailure("POLICY_ACCEPTANCE_PROVIDER_FAILURE");

export class DrizzlePolicyAcceptanceStore implements IPolicyAcceptanceStore {
  constructor(private readonly instrumentation: IInstrumentation) {}

  async insert(row: PolicyAcceptanceRecord): Promise<Result<void, PolicyError>> {
    const exec = resolveExecutor();

    return this.instrumentation.startSpan(
      { name: "DrizzlePolicyAcceptanceStore > insert" },
      async () => {
        try {
          const query = exec.insert(pa).values({
            id: row.id,
            userId: row.userId,
            policyType: row.policyType,
            policyVersion: row.policyVersion,
            ipAddress: row.ipAddress.toNull(),
          });

          await this.instrumentation.startSpan(
            { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
            () => query.execute(),
          );

          return Result.ok();
        } catch (err) {
          this.instrumentation.capture(err);
          return Result.fail(storeFailure("insert"));
        }
      },
    );
  }

  async findLatestVersions(
    userId: string,
  ): Promise<Result<Partial<Record<PolicyType, string>>, PolicyError>> {
    const exec = resolveExecutor();

    return this.instrumentation.startSpan(
      { name: "DrizzlePolicyAcceptanceStore > findLatestVersions" },
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

          const latest: Partial<Record<PolicyType, string>> = {};
          for (const row of rows) {
            const policyType = row.policyType as PolicyType;
            if (!(policyType in latest)) latest[policyType] = row.policyVersion;
          }

          return Result.ok(latest);
        } catch (err) {
          this.instrumentation.capture(err);
          return Result.fail(storeFailure("findLatestVersions"));
        }
      },
    );
  }
}
