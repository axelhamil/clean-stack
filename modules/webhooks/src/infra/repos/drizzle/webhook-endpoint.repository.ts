import {
  createDbFailure,
  type IInstrumentation,
  type ILogger,
  Option,
  Result,
} from "@packages/ddd-kit";
import { and, eq, resolveExecutor, sql } from "@packages/drizzle";
import * as webhooksSchema from "../../../../schemas/webhooks";
import type {
  CreateEndpointArgs,
  EndpointFailureStreak,
  IWebhookEndpointRepository,
  SecretRotation,
  SubscribedEndpoint,
  UpdateEndpointArgs,
  WebhookEndpointRecord,
  WebhookRepoError,
} from "../../../application/ports/repositories/webhook-endpoint.port";
import { toEndpointRecord } from "./webhook.mapper";

const we = webhooksSchema.webhookEndpoint;
const dbAttrs = { "db.system.name": "postgresql" } as const;

export class DrizzleWebhookEndpointRepository implements IWebhookEndpointRepository {
  private readonly fail;

  constructor(
    private readonly instrumentation: IInstrumentation,
    logger: ILogger,
  ) {
    this.fail = createDbFailure("WEBHOOK_PERSISTENCE_PROVIDER_FAILURE", logger);
  }

  async create(args: CreateEndpointArgs): Promise<Result<WebhookEndpointRecord, WebhookRepoError>> {
    const exec = resolveExecutor();
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
          return Result.ok(toEndpointRecord(row));
        } catch (e) {
          this.instrumentation.capture(e);
          return this.fail(e, "webhook endpoint create failed");
        }
      },
    );
  }

  async update(
    args: UpdateEndpointArgs,
  ): Promise<Result<Option<WebhookEndpointRecord>, WebhookRepoError>> {
    const exec = resolveExecutor();
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
          return Result.ok(Option.fromNullable(row).map(toEndpointRecord));
        } catch (e) {
          this.instrumentation.capture(e);
          return this.fail(e, "webhook endpoint update failed");
        }
      },
    );
  }

  async delete(id: string, organizationId: string): Promise<Result<boolean, WebhookRepoError>> {
    const exec = resolveExecutor();
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
          return this.fail(e, "webhook endpoint delete failed");
        }
      },
    );
  }

  async findById(
    id: string,
    organizationId: string,
  ): Promise<Result<Option<WebhookEndpointRecord>, WebhookRepoError>> {
    const exec = resolveExecutor();
    return this.instrumentation.startSpan(
      { name: "DrizzleWebhookEndpointRepository > findById" },
      async () => {
        try {
          const query = exec
            .select()
            .from(we)
            .where(and(eq(we.id, id), eq(we.organizationId, organizationId)))
            .limit(1);
          const [row] = await this.instrumentation.startSpan(
            { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
            () => query.execute(),
          );
          return Result.ok(Option.fromNullable(row).map(toEndpointRecord));
        } catch (e) {
          this.instrumentation.capture(e);
          return this.fail(e, "webhook endpoint lookup failed");
        }
      },
    );
  }

  async findEnabledById(
    id: string,
  ): Promise<Result<Option<WebhookEndpointRecord>, WebhookRepoError>> {
    const exec = resolveExecutor();
    return this.instrumentation.startSpan(
      { name: "DrizzleWebhookEndpointRepository > findEnabledById" },
      async () => {
        try {
          const query = exec
            .select()
            .from(we)
            .where(and(eq(we.id, id), eq(we.enabled, true)))
            .limit(1);
          const [row] = await this.instrumentation.startSpan(
            { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
            () => query.execute(),
          );
          return Result.ok(Option.fromNullable(row).map(toEndpointRecord));
        } catch (e) {
          this.instrumentation.capture(e);
          return this.fail(e, "webhook endpoint lookup failed");
        }
      },
    );
  }

  async listEnabledByOrg(
    organizationId: string,
  ): Promise<Result<SubscribedEndpoint[], WebhookRepoError>> {
    const exec = resolveExecutor();
    return this.instrumentation.startSpan(
      { name: "DrizzleWebhookEndpointRepository > listEnabledByOrg" },
      async () => {
        try {
          const query = exec
            .select({ id: we.id, eventTypes: we.eventTypes })
            .from(we)
            .where(and(eq(we.organizationId, organizationId), eq(we.enabled, true)));
          const rows = await this.instrumentation.startSpan(
            { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
            () => query.execute(),
          );
          return Result.ok(rows);
        } catch (e) {
          this.instrumentation.capture(e);
          return this.fail(e, "webhook endpoint list failed");
        }
      },
    );
  }

  async applySecretRotation(
    args: SecretRotation,
  ): Promise<Result<Option<WebhookEndpointRecord>, WebhookRepoError>> {
    const exec = resolveExecutor();
    return this.instrumentation.startSpan(
      { name: "DrizzleWebhookEndpointRepository > applySecretRotation" },
      async () => {
        try {
          const query = exec
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
          return Result.ok(Option.fromNullable(row).map(toEndpointRecord));
        } catch (e) {
          this.instrumentation.capture(e);
          return this.fail(e, "webhook endpoint applySecretRotation failed");
        }
      },
    );
  }

  async bumpFailure(
    id: string,
    organizationId: string,
  ): Promise<Result<Option<EndpointFailureStreak>, WebhookRepoError>> {
    const exec = resolveExecutor();
    return this.instrumentation.startSpan(
      { name: "DrizzleWebhookEndpointRepository > bumpFailure" },
      async () => {
        try {
          const query = exec
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
          const firstFailedAt = row.firstFailedAt;
          if (firstFailedAt === null) return Result.ok(Option.none());
          return Result.ok(
            Option.some({
              consecutiveFailures: row.consecutiveFailures,
              firstFailedAt,
            }),
          );
        } catch (e) {
          this.instrumentation.capture(e);
          return this.fail(e, "webhook endpoint bumpFailure failed");
        }
      },
    );
  }

  async resetFailure(id: string, organizationId: string): Promise<Result<void, WebhookRepoError>> {
    const exec = resolveExecutor();
    return this.instrumentation.startSpan(
      { name: "DrizzleWebhookEndpointRepository > resetFailure" },
      async () => {
        try {
          const query = exec
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
          return this.fail(e, "webhook endpoint resetFailure failed");
        }
      },
    );
  }

  async markDisabled(
    id: string,
    organizationId: string,
    disabledAt: Date,
  ): Promise<Result<void, WebhookRepoError>> {
    const exec = resolveExecutor();
    return this.instrumentation.startSpan(
      { name: "DrizzleWebhookEndpointRepository > markDisabled" },
      async () => {
        try {
          const query = exec
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
          return this.fail(e, "webhook endpoint markDisabled failed");
        }
      },
    );
  }
}
