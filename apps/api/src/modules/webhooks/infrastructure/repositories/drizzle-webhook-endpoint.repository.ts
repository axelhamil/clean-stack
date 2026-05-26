import { Option, Result } from "@packages/ddd-kit";
import { and, db, eq, type Transaction, webhooksSchema } from "@packages/drizzle";
import { createDbFailure } from "../../../../shared/db-failure";
import type {
  CreateEndpointArgs,
  IWebhookEndpointRepository,
  UpdateEndpointArgs,
  WebhookEndpointRecord,
  WebhookRepoError,
} from "../../application/ports/webhook-endpoint.port";

const we = webhooksSchema.webhookEndpoint;
const fail = createDbFailure("WEBHOOK_PERSISTENCE_PROVIDER_FAILURE");

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
  async create(
    args: CreateEndpointArgs,
    tx?: Transaction,
  ): Promise<Result<WebhookEndpointRecord, WebhookRepoError>> {
    const exec = tx ?? db;
    try {
      const [row] = await exec
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
      if (!row)
        return Result.fail({
          code: "WEBHOOK_PERSISTENCE_PROVIDER_FAILURE",
          message: "webhook endpoint insert returned no row",
        });
      return Result.ok(toRecord(row));
    } catch (e) {
      return fail(e, "webhook endpoint create failed");
    }
  }

  async update(
    args: UpdateEndpointArgs,
    tx?: Transaction,
  ): Promise<Result<Option<WebhookEndpointRecord>, WebhookRepoError>> {
    const exec = tx ?? db;
    const update: Partial<typeof we.$inferInsert> = {};
    if (args.url !== undefined) update.url = args.url;
    if (args.eventTypes !== undefined) update.eventTypes = args.eventTypes;
    if (args.enabled !== undefined) update.enabled = args.enabled;
    try {
      const [row] = await exec
        .update(we)
        .set(update)
        .where(and(eq(we.id, args.id), eq(we.organizationId, args.organizationId)))
        .returning();
      return Result.ok(Option.fromNullable(row).map(toRecord));
    } catch (e) {
      return fail(e, "webhook endpoint update failed");
    }
  }

  async delete(
    id: string,
    organizationId: string,
    tx?: Transaction,
  ): Promise<Result<boolean, WebhookRepoError>> {
    const exec = tx ?? db;
    try {
      const [row] = await exec
        .delete(we)
        .where(and(eq(we.id, id), eq(we.organizationId, organizationId)))
        .returning({ id: we.id });
      return Result.ok(Boolean(row));
    } catch (e) {
      return fail(e, "webhook endpoint delete failed");
    }
  }

  async findById(id: string, organizationId: string): Promise<Option<WebhookEndpointRecord>> {
    const [row] = await db
      .select()
      .from(we)
      .where(and(eq(we.id, id), eq(we.organizationId, organizationId)))
      .limit(1);
    return Option.fromNullable(row).map(toRecord);
  }

  async listByOrg(
    organizationId: string,
  ): Promise<Result<WebhookEndpointRecord[], WebhookRepoError>> {
    try {
      const rows = await db.select().from(we).where(eq(we.organizationId, organizationId));
      return Result.ok(rows.map(toRecord));
    } catch (e) {
      return fail(e, "webhook endpoint list failed");
    }
  }
}
