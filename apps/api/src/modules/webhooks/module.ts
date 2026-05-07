import { defineModule } from "inwire";
import { env } from "../../shared/env";
import { logger } from "../../shared/logger";
import type { IWebhookDeliveryRepository } from "./application/ports/webhook-delivery.port";
import type { IWebhookEndpointRepository } from "./application/ports/webhook-endpoint.port";
import {
  type MasterKeyProvider,
  masterKeyProvider,
  WebhooksService,
} from "./application/services/webhooks.service";
import { DrizzleWebhookDeliveryRepository } from "./infrastructure/repositories/drizzle-webhook-delivery.repository";
import { DrizzleWebhookEndpointRepository } from "./infrastructure/repositories/drizzle-webhook-endpoint.repository";
import { WebhookDeliveryWorker } from "./infrastructure/services/webhook-delivery-worker.service";

declare module "inwire" {
  interface AppDeps {
    IWebhookEndpointRepository: IWebhookEndpointRepository;
    IWebhookDeliveryRepository: IWebhookDeliveryRepository;
    WebhookMasterKey: MasterKeyProvider;
    WebhooksService: WebhooksService;
    WebhookDeliveryWorker: WebhookDeliveryWorker;
  }
}

export const webhooksModule = defineModule()((b) =>
  b
    .add(
      "IWebhookEndpointRepository",
      (): IWebhookEndpointRepository => new DrizzleWebhookEndpointRepository(),
    )
    .add(
      "IWebhookDeliveryRepository",
      (): IWebhookDeliveryRepository => new DrizzleWebhookDeliveryRepository(),
    )
    .add("WebhookMasterKey", () => masterKeyProvider(env.WEBHOOK_MASTER_KEY))
    .add(
      "WebhooksService",
      (c) =>
        new WebhooksService(
          c.IWebhookEndpointRepository,
          c.IWebhookDeliveryRepository,
          c.ITransactionService,
          c.WebhookMasterKey,
        ),
    )
    .add(
      "WebhookDeliveryWorker",
      (c) =>
        new WebhookDeliveryWorker({
          deliveries: c.IWebhookDeliveryRepository,
          masterKey: c.WebhookMasterKey,
          logger,
        }),
    ),
);
