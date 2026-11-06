import type { IInstrumentation, IUnitOfWork } from "@packages/ddd-kit";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import { defineModule } from "inwire";
import { logger } from "../../shared/logger";
import type { WebhookSettings } from "./application/config/webhook-settings";
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

export interface WebhooksPrerequisites {
  IInstrumentation: IInstrumentation;
  ITransactionService: IUnitOfWork;
  IOutboxRepository: IOutboxRepository;
  webhookSettings: WebhookSettings;
}

export const webhooksModule = defineModule<WebhooksPrerequisites>()((b) =>
  b
    .add(
      "IWebhookEndpointRepository",
      (c): IWebhookEndpointRepository => new DrizzleWebhookEndpointRepository(c.IInstrumentation),
    )
    .add(
      "IWebhookDeliveryRepository",
      (c): IWebhookDeliveryRepository => new DrizzleWebhookDeliveryRepository(c.IInstrumentation),
    )
    .add(
      "WebhookMasterKey",
      (c): MasterKeyProvider => masterKeyProvider(c.webhookSettings.masterKeyHex.toUndefined()),
    )
    .add(
      "WebhooksService",
      (c) =>
        new WebhooksService(
          c.IWebhookEndpointRepository,
          c.IWebhookDeliveryRepository,
          c.ITransactionService,
          c.IOutboxRepository,
          c.WebhookMasterKey,
          c.IInstrumentation,
          c.webhookSettings,
        ),
    )
    .add(
      "WebhookDeliveryWorker",
      (c) =>
        new WebhookDeliveryWorker(
          c.IWebhookDeliveryRepository,
          c.IWebhookEndpointRepository,
          c.WebhookMasterKey,
          c.IOutboxRepository,
          c.ITransactionService,
          logger,
          c.IInstrumentation,
          c.webhookSettings.delivery,
        ),
    ),
);
