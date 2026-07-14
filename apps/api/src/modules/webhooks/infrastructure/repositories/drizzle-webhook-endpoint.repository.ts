import { Option, Result } from "@packages/ddd-kit";
import { and, db, eq, sql, type Transaction, webhooksSchema } from "@packages/drizzle";
import { createDbFailure } from "../../../../shared/db-failure";
import type { IInstrumentation } from "../../../../shared/ports/instrumentation.port";
import type {
  CreateEndpointArgs,
  IWebhookEndpointRepository,
  UpdateEndpointArgs,
  WebhookEndpointRecord,
  WebhookRepoError,
} from "../../application/ports/webhook-endpoint.port";

const we = webhooksSchema.webhookEndpoint;
const fail = createDbFailure("WEBHOOK_PERSISTENCE_PROVIDER_FAILURE");
const dbAttrs = { "db.system.name": "postgresql" } as const;

function toRecord(row: typeof we.$inferSelect): WebhookEndpointRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    url: row.url,
    secretCipher: row.secretCipher,
    eventTypes: row.eventTypes,
    enabled: row.enabled,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    previousSecretCipher: row.previousSecretCipher ?? null,
    previousSecretExpiresAt: row.previousSecretExpiresAt ?? null,
    consecutiveFailures: row.consecutiveFailures,
    firstFailedAt: row.firstFailedAt ?? null,
    disabledAt: row.disabledAt ?? null,
  };
}

export class DrizzleWebhookEndpointRepository implements IWebhookEndpointRepository {
  constructor(private readonly instrumentation: IInstrumentation) {}

  async create(
    args: CreateEndpointArgs,
    tx?: Transaction,
  ): Promise<Result<WebhookEndpointRecord, WebhookRepoError>> {
    const exec = tx ?? db;
    return this.instrumentation.startSpan(
      { name: "DrizzleWebhookEndpointRepository > create" },
      async () => {
        try {
          const query = exec
            .insert(we)
            .values({
              id: args.id,
              organizationId: args.organizationId,
              url: args.url,
              secretCipher: args.secretCipher,
              eventTypes: args.eventTypes,
              enabled: args.enabled,
            })
            .returning();
          const [row] = await this.instrumentation.startSpan(
            { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
            () => query.execute(),
          );
          if (!row)
            return Result.fail({
              code: "WEBHOOK_PERSISTENCE_PROVIDER_FAILURE",
              message: "webhook endpoint insert returned no row",
            });
          return Result.ok(toRecord(row));
        } catch (e) {
          this.instrumentation.capture(e);
          return fail(e, "webhook endpoint create failed");
        }
      },
    );
  }

  async update(
    args: UpdateEndpointArgs,
    tx?: Transaction,
  ): Promise<Result<Option<WebhookEndpointRecord>, WebhookRepoError>> {
    const exec = tx ?? db;
    return this.instrumentation.startSpan(
      { name: "DrizzleWebhookEndpointRepository > update" },
      async () => {
        const update: Partial<typeof we.$inferInsert> = {};
        if (args.url !== undefined) update.url = args.url;
        if (args.eventTypes !== undefined) update.eventTypes = args.eventTypes;
        if (args.enabled !== undefined) update.enabled = args.enabled;
        if (args.enabled === true) {
          update.consecutiveFailures = 0;
          update.firstFailedAt = null;
          update.disabledAt = null;
        }
        try {
          const query = exec
            .update(we)
            .set(update)
            .where(and(eq(we.id, args.id), eq(we.organizationId, args.organizationId)))
            .returning();
          const [row] = await this.instrumentation.startSpan(
            { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
            () => query.execute(),
          );
          return Result.ok(Option.fromNullable(row).map(toRecord));
        } catch (e) {
          this.instrumentation.capture(e);
          return fail(e, "webhook endpoint update failed");
        }
      },
    );
  }

  async delete(
    id: string,
    organizationId: string,
    tx?: Transaction,
  ): Promise<Result<boolean, WebhookRepoError>> {
    const exec = tx ?? db;
    return this.instrumentation.startSpan(
      { name: "DrizzleWebhookEndpointRepository > delete" },
      async () => {
        try {
          const query = exec
            .delete(we)
            .where(and(eq(we.id, id), eq(we.organizationId, organizationId)))
            .returning({ id: we.id });
          const [row] = await this.instrumentation.startSpan(
            { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
            () => query.execute(),
          );
          return Result.ok(Boolean(row));
        } catch (e) {
          this.instrumentation.capture(e);
          return fail(e, "webhook endpoint delete failed");
        }
      },
    );
  }

  async findById(id: string, organizationId: string): Promise<Option<WebhookEndpointRecord>> {
    return this.instrumentation.startSpan(
      { name: "DrizzleWebhookEndpointRepository > findById" },
      async () => {
        try {
          const query = db
            .select()
            .from(we)
            .where(and(eq(we.id, id), eq(we.organizationId, organizationId)))
            .limit(1);
          const [row] = await this.instrumentation.startSpan(
            { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
            () => query.execute(),
          );
          return Option.fromNullable(row).map(toRecord);
        } catch (e) {
          this.instrumentation.capture(e);
          throw e;
        }
      },
    );
  }

  async listByOrg(
    organizationId: string,
  ): Promise<Result<WebhookEndpointRecord[], WebhookRepoError>> {
    return this.instrumentation.startSpan(
      { name: "DrizzleWebhookEndpointRepository > listByOrg" },
      async () => {
        try {
          const query = db.select().from(we).where(eq(we.organizationId, organizationId));
          const rows = await this.instrumentation.startSpan(
            { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
            () => query.execute(),
          );
          return Result.ok(rows.map(toRecord));
        } catch (e) {
          this.instrumentation.capture(e);
          return fail(e, "webhook endpoint list failed");
        }
      },
    );
  }

  async applySecretRotation(
    args: {
      id: string;
      organizationId: string;
      secretCipher: string;
      previousSecretCipher: string;
      previousSecretExpiresAt: Date;
    },
    tx: Transaction,
  ): Promise<Result<Option<WebhookEndpointRecord>, WebhookRepoError>> {
    return this.instrumentation.startSpan(
      { name: "DrizzleWebhookEndpointRepository > applySecretRotation" },
      async () => {
        try {
          const query = tx
            .update(we)
            .set({
              secretCipher: args.secretCipher,
              previousSecretCipher: args.previousSecretCipher,
              previousSecretExpiresAt: args.previousSecretExpiresAt,
            })
            .where(and(eq(we.id, args.id), eq(we.organizationId, args.organizationId)))
            .returning();
          const [row] = await this.instrumentation.startSpan(
            { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
            () => query.execute(),
          );
          return Result.ok(Option.fromNullable(row).map(toRecord));
        } catch (e) {
          this.instrumentation.capture(e);
          return fail(e, "webhook endpoint applySecretRotation failed");
        }
      },
    );
  }

  async bumpFailure(
    id: string,
    organizationId: string,
    tx: Transaction,
  ): Promise<
    Result<Option<{ consecutiveFailures: number; firstFailedAt: Date }>, WebhookRepoError>
  > {
    return this.instrumentation.startSpan(
      { name: "DrizzleWebhookEndpointRepository > bumpFailure" },
      async () => {
        try {
          const query = tx
            .update(we)
            .set({
              consecutiveFailures: sql`${we.consecutiveFailures} + 1`,
              firstFailedAt: sql`COALESCE(${we.firstFailedAt}, now())`,
            })
            .where(and(eq(we.id, id), eq(we.organizationId, organizationId)))
            .returning({
              consecutiveFailures: we.consecutiveFailures,
              firstFailedAt: we.firstFailedAt,
            });
          const [row] = await this.instrumentation.startSpan(
            { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
            () => query.execute(),
          );
          if (!row) return Result.ok(Option.none());
          return Result.ok(
            Option.some({
              consecutiveFailures: row.consecutiveFailures,
              firstFailedAt: row.firstFailedAt!,
            }),
          );
        } catch (e) {
          this.instrumentation.capture(e);
          return fail(e, "webhook endpoint bumpFailure failed");
        }
      },
    );
  }

  async resetFailure(
    id: string,
    organizationId: string,
    tx: Transaction,
  ): Promise<Result<void, WebhookRepoError>> {
    return this.instrumentation.startSpan(
      { name: "DrizzleWebhookEndpointRepository > resetFailure" },
      async () => {
        try {
          const query = tx
            .update(we)
            .set({ consecutiveFailures: 0, firstFailedAt: null })
            .where(and(eq(we.id, id), eq(we.organizationId, organizationId)));
          await this.instrumentation.startSpan(
            { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
            () => query.execute(),
          );
          return Result.ok(undefined);
        } catch (e) {
          this.instrumentation.capture(e);
          return fail(e, "webhook endpoint resetFailure failed");
        }
      },
    );
  }

  async markDisabled(
    id: string,
    organizationId: string,
    disabledAt: Date,
    tx: Transaction,
  ): Promise<Result<void, WebhookRepoError>> {
    return this.instrumentation.startSpan(
      { name: "DrizzleWebhookEndpointRepository > markDisabled" },
      async () => {
        try {
          const query = tx
            .update(we)
            .set({ enabled: false, disabledAt })
            .where(and(eq(we.id, id), eq(we.organizationId, organizationId)));
          await this.instrumentation.startSpan(
            { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
            () => query.execute(),
          );
          return Result.ok(undefined);
        } catch (e) {
          this.instrumentation.capture(e);
          return fail(e, "webhook endpoint markDisabled failed");
        }
      },
    );
  }
}
