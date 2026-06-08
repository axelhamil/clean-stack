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
    const invoker = tx ?? db;
    return this.instrumentation.startSpan(
      { name: "DrizzlePolicyAcceptanceStore > insert" },
      async () => {
        try {
          const query = invoker.insert(policiesSchema.policyAcceptance).values({
            id: row.id,
            userId: row.userId,
            policyType: row.policyType,
            policyVersion: row.policyVersion,
            ipAddress: row.ipAddress,
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
    const invoker = tx ?? db;
    return this.instrumentation.startSpan(
      { name: "DrizzlePolicyAcceptanceStore > findLatestVersions" },
      async () => {
        try {
          const query = invoker
            .select({
              policyType: policiesSchema.policyAcceptance.policyType,
              policyVersion: policiesSchema.policyAcceptance.policyVersion,
            })
            .from(policiesSchema.policyAcceptance)
            .where(eq(policiesSchema.policyAcceptance.userId, userId))
            .orderBy(desc(policiesSchema.policyAcceptance.acceptedAt));

          const rows = await this.instrumentation.startSpan(
            { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
            () => query.execute(),
          );

          const latest: Partial<Record<PolicyType, string>> = {};
          for (const row of rows) {
            const t = row.policyType as PolicyType;
            if (!(t in latest)) {
              latest[t] = row.policyVersion;
            }
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
