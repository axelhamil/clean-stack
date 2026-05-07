import { and, db, eq, type Transaction, webhooksSchema } from "@packages/drizzle";
import type {
  CreateEndpointArgs,
  IWebhookEndpointRepository,
  UpdateEndpointArgs,
  WebhookEndpointRecord,
} from "../../application/ports/webhook-endpoint.port";

const we = webhooksSchema.webhookEndpoint;

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
  async create(args: CreateEndpointArgs, tx?: Transaction): Promise<WebhookEndpointRecord> {
    const exec = tx ?? db;
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
    if (!row) throw new Error("webhook endpoint insert returned no row");
    return toRecord(row);
  }

  async update(args: UpdateEndpointArgs, tx?: Transaction): Promise<WebhookEndpointRecord | null> {
    const exec = tx ?? db;
    const update: Partial<typeof we.$inferInsert> = {};
    if (args.url !== undefined) update.url = args.url;
    if (args.eventTypes !== undefined) update.eventTypes = args.eventTypes;
    if (args.enabled !== undefined) update.enabled = args.enabled;
    const [row] = await exec
      .update(we)
      .set(update)
      .where(and(eq(we.id, args.id), eq(we.organizationId, args.organizationId)))
      .returning();
    return row ? toRecord(row) : null;
  }

  async delete(id: string, organizationId: string, tx?: Transaction): Promise<boolean> {
    const exec = tx ?? db;
    const [row] = await exec
      .delete(we)
      .where(and(eq(we.id, id), eq(we.organizationId, organizationId)))
      .returning({ id: we.id });
    return Boolean(row);
  }

  async findById(id: string, organizationId: string): Promise<WebhookEndpointRecord | null> {
    const [row] = await db
      .select()
      .from(we)
      .where(and(eq(we.id, id), eq(we.organizationId, organizationId)))
      .limit(1);
    return row ? toRecord(row) : null;
  }

  async listByOrg(organizationId: string): Promise<WebhookEndpointRecord[]> {
    const rows = await db.select().from(we).where(eq(we.organizationId, organizationId));
    return rows.map(toRecord);
  }
}
