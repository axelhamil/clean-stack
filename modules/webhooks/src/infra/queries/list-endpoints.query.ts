import { createDbFailure, type IInstrumentation, type ILogger, Result } from "@packages/ddd-kit";
import { eq, resolveExecutor } from "@packages/drizzle";
import * as webhooksSchema from "../../../schemas/webhooks";
import type {
  WebhookEndpointRecord,
  WebhookRepoError,
} from "../../application/ports/repositories/webhook-endpoint.port";
import type {
  IListEndpointsQuery,
  ListEndpointsInput,
} from "../../application/queries/list-endpoints.query";
import { toEndpointRecord } from "../repos/drizzle/webhook.mapper";

const we = webhooksSchema.webhookEndpoint;
const dbAttrs = { "db.system.name": "postgresql" } as const;

export class DrizzleListEndpointsQuery implements IListEndpointsQuery {
  private readonly fail;

  constructor(
    private readonly instrumentation: IInstrumentation,
    logger: ILogger,
  ) {
    this.fail = createDbFailure("WEBHOOK_PERSISTENCE_PROVIDER_FAILURE", logger);
  }

  async execute({
    organizationId,
  }: ListEndpointsInput): Promise<Result<WebhookEndpointRecord[], WebhookRepoError>> {
    const exec = resolveExecutor();
    return this.instrumentation.startSpan(
      { name: "DrizzleListEndpointsQuery > execute" },
      async () => {
        try {
          const query = exec.select().from(we).where(eq(we.organizationId, organizationId));
          const rows = await this.instrumentation.startSpan(
            { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
            () => query.execute(),
          );
          return Result.ok(rows.map(toEndpointRecord));
        } catch (e) {
          this.instrumentation.capture(e);
          return this.fail(e, "webhook endpoint list failed");
        }
      },
    );
  }
}
