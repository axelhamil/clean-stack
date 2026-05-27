import { Option, Result } from "@packages/ddd-kit";
import { and, db, eq, type Transaction, webhooksSchema } from "@packages/drizzle";
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
}
