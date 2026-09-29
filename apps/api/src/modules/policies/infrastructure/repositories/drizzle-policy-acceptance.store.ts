import { Result } from "@packages/ddd-kit";
import { db, desc, eq, policiesSchema } from "@packages/drizzle";
import type { PolicyType } from "@packages/policies";
import type { IInstrumentation } from "../../../../shared/ports/instrumentation.port";
import type { ITransaction } from "../../../../shared/transaction";
import type {
  IPolicyAcceptanceStore,
  PolicyAcceptanceRecord,
  PolicyError,
} from "../../application/ports/policy-acceptance.port";

const pa = policiesSchema.policyAcceptance;
const dbAttrs = { "db.system.name": "postgresql" } as const;

function storeFailure(err: unknown, op: string): PolicyError {
  return {
    code: "POLICY_ACCEPTANCE_PROVIDER_FAILURE",
    message: `database operation failed: ${op}`,
    metadata: { cause: err instanceof Error ? err.message : String(err) },
  };
}

export class DrizzlePolicyAcceptanceStore implements IPolicyAcceptanceStore {
  constructor(private readonly instrumentation: IInstrumentation) {}

  async insert(row: PolicyAcceptanceRecord, tx?: ITransaction): Promise<Result<void, PolicyError>> {
    const exec = tx ?? db;

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
          return Result.fail(storeFailure(err, "insert"));
        }
      },
    );
  }

  async findLatestVersions(
    userId: string,
    tx?: ITransaction,
  ): Promise<Result<Partial<Record<PolicyType, string>>, PolicyError>> {
    const exec = tx ?? db;

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
          return Result.fail(storeFailure(err, "findLatestVersions"));
        }
      },
    );
  }
}
