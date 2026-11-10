import { type IInstrumentation, Option, Result } from "@packages/ddd-kit";
import {
  and,
  dbClockNow,
  dbNow,
  dbOperationFailure,
  desc,
  eq,
  isNull,
  lt,
  or,
  resolveExecutor,
  secondsFromClock,
} from "@packages/drizzle";
import * as billingSchema from "../../../schemas/billing";
import type {
  IStripeEventStore,
  StripeEventDelivery,
  StripeEventRow,
  StripeEventStoreError,
} from "../../application/ports/stripe-event.port";

const { stripeEvent } = billingSchema;
const failure = dbOperationFailure("STRIPE_EVENT_PROVIDER_FAILURE");
const dbAttrs = { "db.system.name": "postgresql" } as const;

function toRow({ replayClaimedAt: _, ...row }: typeof stripeEvent.$inferSelect): StripeEventRow {
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
            status: delivery.lastError.isSome() ? ("failed" as const) : ("received" as const),
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

  async claimReplay(
    id: string,
    leaseSeconds: number,
  ): Promise<Result<boolean, StripeEventStoreError>> {
    const exec = resolveExecutor();

    return this.instrumentation.startSpan(
      { name: "DrizzleStripeEventStore > claimReplay" },
      async () => {
        try {
          const query = exec
            .update(stripeEvent)
            .set({ replayClaimedAt: dbClockNow })
            .where(
              and(
                eq(stripeEvent.id, id),
                or(
                  isNull(stripeEvent.replayClaimedAt),
                  lt(stripeEvent.replayClaimedAt, secondsFromClock(-leaseSeconds)),
                ),
              ),
            )
            .returning({ id: stripeEvent.id });
          const rows = await this.instrumentation.startSpan(
            { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
            () => query.execute(),
          );

          return Result.ok(rows.length > 0);
        } catch (err) {
          this.instrumentation.capture(err);
          return Result.fail(failure("claim stripe event replay"));
        }
      },
    );
  }

  async releaseReplay(id: string): Promise<Result<void, StripeEventStoreError>> {
    const exec = resolveExecutor();

    return this.instrumentation.startSpan(
      { name: "DrizzleStripeEventStore > releaseReplay" },
      async () => {
        try {
          const query = exec
            .update(stripeEvent)
            .set({ replayClaimedAt: null })
            .where(eq(stripeEvent.id, id));
          await this.instrumentation.startSpan(
            { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
            () => query.execute(),
          );

          return Result.ok();
        } catch (err) {
          this.instrumentation.capture(err);
          return Result.fail(failure("release stripe event replay"));
        }
      },
    );
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
