import { createDbFailure, type IInstrumentation, type ILogger, Result } from "@packages/ddd-kit";
import { count, eq, resolveExecutor } from "@packages/drizzle";
import * as webhooksSchema from "../../../schemas/webhooks";
import type { WebhookRepoError } from "../../application/ports/repositories/webhook-endpoint.port";
import type { ICountDeadLettersQuery } from "../../application/queries/count-dead-letters.query";

const wd = webhooksSchema.webhookDelivery;
const dbAttrs = { "db.system.name": "postgresql" } as const;

export class DrizzleCountDeadLettersQuery implements ICountDeadLettersQuery {
  private readonly fail;

  constructor(
    private readonly instrumentation: IInstrumentation,
    logger: ILogger,
  ) {
    this.fail = createDbFailure("WEBHOOK_PERSISTENCE_PROVIDER_FAILURE", logger);
  }

  async execute(): Promise<Result<number, WebhookRepoError>> {
    const exec = resolveExecutor();
    return this.instrumentation.startSpan(
      { name: "DrizzleCountDeadLettersQuery > execute" },
      async () => {
        try {
          const query = exec
            .select({ value: count() })
            .from(wd)
            .where(eq(wd.status, "dead_letter"));
          const [total] = await this.instrumentation.startSpan(
            { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
            () => query.execute(),
          );
          return Result.ok(total?.value ?? 0);
        } catch (e) {
          this.instrumentation.capture(e);
          return this.fail(e, "webhook dead letter count failed");
        }
      },
    );
  }
}
