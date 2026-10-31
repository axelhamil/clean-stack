import { Option, Result } from "@packages/ddd-kit";
import { billingSchema, dbNow, desc, eq, resolveExecutor } from "@packages/drizzle";
import { dbOperationFailure } from "../../../../shared/db-failure";
import type { IInstrumentation } from "../../../../shared/ports/instrumentation.port";
import type {
  IStripeEventStore,
  StripeEventDelivery,
  StripeEventRow,
  StripeEventStoreError,
} from "../../../../shared/ports/stripe-event.port";

const { stripeEvent } = billingSchema;
const failure = dbOperationFailure("ADMIN_OPS_PROVIDER_FAILURE");
const dbAttrs = { "db.system.name": "postgresql" } as const;

function toRow(row: typeof stripeEvent.$inferSelect): StripeEventRow {
  return {
    ...row,
    lastError: Option.fromNullable(row.lastError),
    replayedAt: Option.fromNullable(row.replayedAt),
  };
}

export class DrizzleStripeEventStore implements IStripeEventStore {
  constructor(private readonly instrumentation: IInstrumentation) {}

  async recordDelivery(
    delivery: StripeEventDelivery,
  ): Promise<Result<void, StripeEventStoreError>> {
    const exec = resolveExecutor();

    return this.instrumentation.startSpan(
      { name: "DrizzleStripeEventStore > recordDelivery" },
      async () => {
        try {
          const outcome = {
            status: delivery.lastError.isSome() ? ("failed" as const) : ("processed" as const),
            lastError: delivery.lastError.toNull(),
          };
          const query = exec
            .insert(stripeEvent)
            .values({ id: delivery.id, type: delivery.type, ...outcome })
            .onConflictDoUpdate({ target: stripeEvent.id, set: outcome });
          await this.instrumentation.startSpan(
            { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
            () => query.execute(),
          );

          return Result.ok();
        } catch (err) {
          this.instrumentation.capture(err);
          return Result.fail(failure("record stripe event"));
        }
      },
    );
  }

  async find(id: string): Promise<Result<Option<StripeEventRow>, StripeEventStoreError>> {
    const exec = resolveExecutor();

    return this.instrumentation.startSpan({ name: "DrizzleStripeEventStore > find" }, async () => {
      try {
        const query = exec.select().from(stripeEvent).where(eq(stripeEvent.id, id)).limit(1);
        const [row] = await this.instrumentation.startSpan(
          { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
          () => query.execute(),
        );

        return Result.ok(Option.fromNullable(row).map(toRow));
      } catch (err) {
        this.instrumentation.capture(err);
        return Result.fail(failure("find stripe event"));
      }
    });
  }

  async list(limit: number): Promise<Result<StripeEventRow[], StripeEventStoreError>> {
    const exec = resolveExecutor();

    return this.instrumentation.startSpan({ name: "DrizzleStripeEventStore > list" }, async () => {
      try {
        const query = exec
          .select()
          .from(stripeEvent)
          .orderBy(desc(stripeEvent.receivedAt))
          .limit(limit);
        const rows = await this.instrumentation.startSpan(
          { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
          () => query.execute(),
        );

        return Result.ok(rows.map(toRow));
      } catch (err) {
        this.instrumentation.capture(err);
        return Result.fail(failure("list stripe events"));
      }
    });
  }

  async markReplayed(id: string): Promise<Result<void, StripeEventStoreError>> {
    const exec = resolveExecutor();

    return this.instrumentation.startSpan(
      { name: "DrizzleStripeEventStore > markReplayed" },
      async () => {
        try {
          const query = exec
            .update(stripeEvent)
            .set({ replayedAt: dbNow })
            .where(eq(stripeEvent.id, id));
          await this.instrumentation.startSpan(
            { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
            () => query.execute(),
          );

          return Result.ok();
        } catch (err) {
          this.instrumentation.capture(err);
          return Result.fail(failure("mark stripe event replayed"));
        }
      },
    );
  }
}
