import { createDbFailure, type IInstrumentation, type ILogger, Result } from "@packages/ddd-kit";
import { and, asc, eq, resolveExecutor } from "@packages/drizzle";
import * as webhooksSchema from "../../../schemas/webhooks";
import type { WebhookDeliveryWithAttempts } from "../../application/ports/repositories/webhook-delivery.port";
import {
  DELIVERY_NOT_FOUND,
  ENDPOINT_NOT_FOUND,
  type WebhookDeliveryNotFound,
  type WebhookEndpointNotFound,
  type WebhookRepoError,
} from "../../application/ports/repositories/webhook-endpoint.port";
import type {
  GetDeliveryInput,
  IGetDeliveryQuery,
} from "../../application/queries/get-delivery.query";
import { toAttemptRecord, toDeliveryRecord } from "../repos/drizzle/webhook.mapper";
import { ownedEndpointQuery } from "./owned-endpoint";

const wd = webhooksSchema.webhookDelivery;
const we = webhooksSchema.webhookEndpoint;
const wda = webhooksSchema.webhookDeliveryAttempt;

export class DrizzleGetDeliveryQuery implements IGetDeliveryQuery {
  private readonly fail;

  constructor(
    private readonly instrumentation: IInstrumentation,
    logger: ILogger,
  ) {
    this.fail = createDbFailure("WEBHOOK_PERSISTENCE_PROVIDER_FAILURE", logger);
  }

  async execute({
    deliveryId,
    endpointId,
    organizationId,
  }: GetDeliveryInput): Promise<
    Result<
      WebhookDeliveryWithAttempts,
      WebhookRepoError | WebhookEndpointNotFound | WebhookDeliveryNotFound
    >
  > {
    const exec = resolveExecutor();
    return this.instrumentation.startSpan(
      { name: "DrizzleGetDeliveryQuery > execute" },
      async () => {
        try {
          const [endpoint] = await ownedEndpointQuery(exec, endpointId, organizationId).execute();
          if (!endpoint) return Result.fail(ENDPOINT_NOT_FOUND);

          const [row] = await exec
            .select({ d: wd })
            .from(wd)
            .innerJoin(we, eq(wd.endpointId, we.id))
            .where(
              and(
                eq(wd.id, deliveryId),
                eq(wd.endpointId, endpointId),
                eq(we.organizationId, organizationId),
              ),
            )
            .limit(1)
            .execute();
          if (!row) return Result.fail(DELIVERY_NOT_FOUND);

          const attemptRows = await exec
            .select()
            .from(wda)
            .where(eq(wda.deliveryId, deliveryId))
            .orderBy(asc(wda.attemptNumber))
            .execute();

          return Result.ok({
            ...toDeliveryRecord(row.d),
            attemptHistory: attemptRows.map(toAttemptRecord),
          });
        } catch (e) {
          this.instrumentation.capture(e);
          return this.fail(e, "webhook delivery lookup failed");
        }
      },
    );
  }
}
