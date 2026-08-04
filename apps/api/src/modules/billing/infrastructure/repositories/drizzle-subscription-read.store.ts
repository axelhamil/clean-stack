import { Option, Result } from "@packages/ddd-kit";
import { and, billingSchema, db, eq, inArray } from "@packages/drizzle";
import type { IInstrumentation } from "../../../../shared/ports/instrumentation.port";
import type { ITransaction } from "../../../../shared/transaction";
import type {
  BillingError,
  ISubscriptionReadStore,
  SubscriptionRow,
} from "../../application/ports/subscription-read.port";

const dbAttrs = { "db.system.name": "postgresql" } as const;
const ACTIVE_STATUSES = ["active", "trialing"] as const;

function storeFailure(err: unknown, op: string): BillingError {
  return {
    code: "BILLING_PROVIDER_FAILURE",
    message: `database operation failed: ${op}`,
    metadata: { cause: err instanceof Error ? err.message : String(err) },
  };
}

export class DrizzleSubscriptionReadStore implements ISubscriptionReadStore {
  constructor(private readonly instrumentation: IInstrumentation) {}

  async findCustomerIdByReference(
    referenceId: string,
    tx?: ITransaction,
  ): Promise<Result<Option<string>, BillingError>> {
    const invoker = tx ?? db;
    return this.instrumentation.startSpan(
      { name: "DrizzleSubscriptionReadStore > findCustomerIdByReference" },
      async () => {
        try {
          const query = invoker
            .select({
              stripeCustomerId: billingSchema.subscription.stripeCustomerId,
            })
            .from(billingSchema.subscription)
            .where(
              and(
                eq(billingSchema.subscription.referenceId, referenceId),
                inArray(billingSchema.subscription.status, [...ACTIVE_STATUSES]),
              ),
            )
            .limit(1);
          const rows = await this.instrumentation.startSpan(
            { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
            () => query.execute(),
          );
          const r = rows[0];
          return Result.ok(r ? Option.fromNullable(r.stripeCustomerId) : Option.none());
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
    const invoker = tx ?? db;
    return this.instrumentation.startSpan(
      { name: "DrizzleSubscriptionReadStore > findActiveByReference" },
      async () => {
        try {
          const query = invoker
            .select({
              tier: billingSchema.subscription.plan,
              status: billingSchema.subscription.status,
            })
            .from(billingSchema.subscription)
            .where(
              and(
                eq(billingSchema.subscription.referenceId, referenceId),
                inArray(billingSchema.subscription.status, [...ACTIVE_STATUSES]),
              ),
            )
            .limit(1);
          const rows = await this.instrumentation.startSpan(
            { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
            () => query.execute(),
          );
          const r = rows[0];
          return Result.ok(r ? Option.some({ tier: r.tier, status: r.status }) : Option.none());
        } catch (err) {
          this.instrumentation.capture(err);
          return Result.fail(storeFailure(err, "findActiveByReference"));
        }
      },
    );
  }
}
