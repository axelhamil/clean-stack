import { Option, Result } from "@packages/ddd-kit";
import { and, billingSchema, db, eq, inArray } from "@packages/drizzle";
import type { IInstrumentation } from "../../../../shared/ports/instrumentation.port";
import type { ITransaction } from "../../../../shared/transaction";
import type {
  BillingError,
  ISubscriptionReadStore,
  SubscriptionRow,
} from "../../application/ports/subscription-read.port";

const sub = billingSchema.subscription;
const dbAttrs = { "db.system.name": "postgresql" } as const;
const ACTIVE_STATUSES = ["active", "trialing"] as const;

function storeFailure(err: unknown, op: string): BillingError {
  return {
    code: "BILLING_PROVIDER_FAILURE",
    message: `database operation failed: ${op}`,
    metadata: { cause: err instanceof Error ? err.message : String(err) },
  };
}

function activeSubscriptionOf(referenceId: string) {
  return and(eq(sub.referenceId, referenceId), inArray(sub.status, [...ACTIVE_STATUSES]));
}

export class DrizzleSubscriptionReadStore implements ISubscriptionReadStore {
  constructor(private readonly instrumentation: IInstrumentation) {}

  async findCustomerIdByReference(
    referenceId: string,
    tx?: ITransaction,
  ): Promise<Result<Option<string>, BillingError>> {
    const exec = tx ?? db;

    return this.instrumentation.startSpan(
      { name: "DrizzleSubscriptionReadStore > findCustomerIdByReference" },
      async () => {
        try {
          const query = exec
            .select({ stripeCustomerId: sub.stripeCustomerId })
            .from(sub)
            .where(activeSubscriptionOf(referenceId))
            .limit(1);

          const [row] = await this.instrumentation.startSpan(
            { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
            () => query.execute(),
          );

          return Result.ok(
            Option.fromNullable(row).flatMap((r) => Option.fromNullable(r.stripeCustomerId)),
          );
        } catch (err) {
          this.instrumentation.capture(err);
          return Result.fail(storeFailure(err, "findCustomerIdByReference"));
        }
      },
    );
  }

  async findActiveByReference(
    referenceId: string,
    tx?: ITransaction,
  ): Promise<Result<Option<SubscriptionRow>, BillingError>> {
    const exec = tx ?? db;

    return this.instrumentation.startSpan(
      { name: "DrizzleSubscriptionReadStore > findActiveByReference" },
      async () => {
        try {
          const query = exec
            .select({ tier: sub.plan, status: sub.status })
            .from(sub)
            .where(activeSubscriptionOf(referenceId))
            .limit(1);

          const [row] = await this.instrumentation.startSpan(
            { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
            () => query.execute(),
          );

          return Result.ok(Option.fromNullable(row));
        } catch (err) {
          this.instrumentation.capture(err);
          return Result.fail(storeFailure(err, "findActiveByReference"));
        }
      },
    );
  }
}
