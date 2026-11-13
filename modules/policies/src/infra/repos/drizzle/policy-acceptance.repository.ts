import { type IInstrumentation, Result } from "@packages/ddd-kit";
import { dbOperationFailure, resolveExecutor } from "@packages/drizzle";
import * as policiesSchema from "../../../../schemas/policies";
import type {
  IPolicyAcceptanceRepository,
  PolicyAcceptanceRecord,
  PolicyError,
} from "../../../application/ports/repositories/policy-acceptance.port";

const pa = policiesSchema.policyAcceptance;
const dbAttrs = { "db.system.name": "postgresql" } as const;

const repositoryFailure = dbOperationFailure("POLICY_ACCEPTANCE_PROVIDER_FAILURE");

export class DrizzlePolicyAcceptanceRepository implements IPolicyAcceptanceRepository {
  constructor(private readonly instrumentation: IInstrumentation) {}

  async insert(row: PolicyAcceptanceRecord): Promise<Result<void, PolicyError>> {
    const exec = resolveExecutor();

    return this.instrumentation.startSpan(
      { name: "DrizzlePolicyAcceptanceRepository > insert" },
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
          return Result.fail(repositoryFailure("insert"));
        }
      },
    );
  }
}
