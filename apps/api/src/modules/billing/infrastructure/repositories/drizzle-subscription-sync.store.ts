import { Option, Result } from "@packages/ddd-kit";
import { billingSchema, eq, or, resolveExecutor } from "@packages/drizzle";
import { dbOperationFailure } from "../../../../shared/db-failure";
import type { IInstrumentation } from "../../../../shared/ports/instrumentation.port";
import type { BillingError } from "../../application/ports/subscription-read.port";
import type {
  ISubscriptionSyncStore,
  SubscriptionSyncKey,
  SubscriptionSyncState,
} from "../../application/ports/subscription-sync.port";

const sub = billingSchema.subscription;
const dbAttrs = { "db.system.name": "postgresql" } as const;
const failure = dbOperationFailure("BILLING_PROVIDER_FAILURE");

export class DrizzleSubscriptionSyncStore implements ISubscriptionSyncStore {
  constructor(private readonly instrumentation: IInstrumentation) {}

  async findSyncState({
    stripeSubscriptionId,
    localId,
  }: SubscriptionSyncKey): Promise<Result<Option<SubscriptionSyncState>, BillingError>> {
    const exec = resolveExecutor();

    return this.instrumentation.startSpan(
      { name: "DrizzleSubscriptionSyncStore > findSyncState" },
      async () => {
        try {
          const byStripeId = eq(sub.stripeSubscriptionId, stripeSubscriptionId);
          const query = exec
            .select({ status: sub.status, cancelAtPeriodEnd: sub.cancelAtPeriodEnd })
            .from(sub)
            .where(localId.isSome() ? or(byStripeId, eq(sub.id, localId.unwrap())) : byStripeId)
            .limit(1);
          const [row] = await this.instrumentation.startSpan(
            { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
            () => query.execute(),
          );

          return Result.ok(
            Option.fromNullable(row).map(({ status, cancelAtPeriodEnd }) => ({
              status,
              cancelAtPeriodEnd: cancelAtPeriodEnd ?? false,
            })),
          );
        } catch (err) {
          this.instrumentation.capture(err);
          return Result.fail(failure("find subscription sync state"));
        }
      },
    );
  }
}
