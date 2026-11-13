import {
  createDbFailure,
  type IInstrumentation,
  type ILogger,
  Option,
  Result,
} from "@packages/ddd-kit";
import { and, desc, eq, lt, resolveExecutor } from "@packages/drizzle";
import * as webhooksSchema from "../../../schemas/webhooks";
import {
  ENDPOINT_NOT_FOUND,
  type WebhookEndpointNotFound,
  type WebhookRepoError,
} from "../../application/ports/repositories/webhook-endpoint.port";
import type {
  DeliveryPage,
  IListDeliveriesQuery,
  ListDeliveriesInput,
} from "../../application/queries/list-deliveries.query";
import { toDeliveryRecord } from "../repos/drizzle/webhook.mapper";
import { ownedEndpointQuery } from "./owned-endpoint";

const wd = webhooksSchema.webhookDelivery;
const we = webhooksSchema.webhookEndpoint;

export class DrizzleListDeliveriesQuery implements IListDeliveriesQuery {
  private readonly fail;

  constructor(
    private readonly instrumentation: IInstrumentation,
    logger: ILogger,
  ) {
    this.fail = createDbFailure("WEBHOOK_PERSISTENCE_PROVIDER_FAILURE", logger);
  }

  async execute(
    args: ListDeliveriesInput,
  ): Promise<Result<DeliveryPage, WebhookRepoError | WebhookEndpointNotFound>> {
    const exec = resolveExecutor();
    return this.instrumentation.startSpan(
      { name: "DrizzleListDeliveriesQuery > execute" },
      async () => {
        try {
          const [endpoint] = await ownedEndpointQuery(
            exec,
            args.endpointId,
            args.organizationId,
          ).execute();
          if (!endpoint) return Result.fail(ENDPOINT_NOT_FOUND);

          const limit = Math.min(args.limit ?? 50, 200);
          const conds = [eq(wd.endpointId, args.endpointId)];
          if (args.status) conds.push(eq(wd.status, args.status));
          if (args.cursor) {
            const cursorDate = new Date(args.cursor);
            if (!Number.isNaN(cursorDate.getTime())) conds.push(lt(wd.createdAt, cursorDate));
          }
          const rows = await exec
            .select({ d: wd })
            .from(wd)
            .innerJoin(we, eq(wd.endpointId, we.id))
            .where(and(eq(we.organizationId, args.organizationId), ...conds))
            .orderBy(desc(wd.createdAt))
            .limit(limit + 1)
            .execute();
          const hasMore = rows.length > limit;
          const items = (hasMore ? rows.slice(0, limit) : rows).map((r) => toDeliveryRecord(r.d));
          const nextCursor = hasMore
            ? Option.fromNullable(items.at(-1)?.createdAt.toISOString())
            : Option.none<string>();

          return Result.ok({ items, nextCursor });
        } catch (e) {
          this.instrumentation.capture(e);
          return this.fail(e, "webhook delivery list failed");
        }
      },
    );
  }
}
