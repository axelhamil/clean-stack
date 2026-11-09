import type { IInstrumentation, ILogger, IUnitOfWork } from "@packages/ddd-kit";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import { defineModule } from "inwire";
import type { WebhookSettings } from "./application/config/webhook-settings";
import type { IUrlGuard } from "./application/ports/url-guard.port";
import type { IWebhookDeliveryRepository } from "./application/ports/webhook-delivery.port";
import type { IWebhookEndpointRepository } from "./application/ports/webhook-endpoint.port";
import { type MasterKeyProvider, WebhooksService } from "./application/services/webhooks.service";
import { aeadSecretCipher, masterKeyProvider } from "./infrastructure/crypto/aead-secret-cipher";
import { DrizzleWebhookDeliveryRepository } from "./infrastructure/repositories/drizzle-webhook-delivery.repository";
import { DrizzleWebhookEndpointRepository } from "./infrastructure/repositories/drizzle-webhook-endpoint.repository";
import { dnsUrlGuard } from "./infrastructure/services/ssrf-guard";
import { WebhookDeliveryWorker } from "./infrastructure/services/webhook-delivery-worker.service";
import { WebhookFanoutSubscriber } from "./infrastructure/services/webhook-fanout-subscriber";

export interface WebhooksPrerequisites {
  IInstrumentation: IInstrumentation;
  ILogger: ILogger;
  ITransactionService: IUnitOfWork;
  IOutboxRepository: IOutboxRepository;
  webhookSettings: WebhookSettings;
}

export const webhooksModule = defineModule<WebhooksPrerequisites>()((b) =>
  b
    .add(
      "IWebhookEndpointRepository",
      (c): IWebhookEndpointRepository =>
        new DrizzleWebhookEndpointRepository(c.IInstrumentation, c.ILogger),
    )
    .add(
      "IWebhookDeliveryRepository",
      (c): IWebhookDeliveryRepository =>
        new DrizzleWebhookDeliveryRepository(c.IInstrumentation, c.ILogger),
    )
    .add(
      "WebhookMasterKey",
      (c): MasterKeyProvider => masterKeyProvider(c.webhookSettings.masterKeyHex.toUndefined()),
    )
    .add("IUrlGuard", (c): IUrlGuard => dnsUrlGuard(c.webhookSettings.delivery.httpsOnly))
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
          aeadSecretCipher,
          c.IUrlGuard,
          c.ILogger,
          { secretGraceHours: c.webhookSettings.secretGraceHours },
        ),
    )
    .add(
      "WebhookFanoutSubscriber",
      (c) => new WebhookFanoutSubscriber(c.ITransactionService, c.IInstrumentation),
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
          c.ILogger,
          c.IInstrumentation,
          c.IUrlGuard,
          c.webhookSettings.delivery,
        ),
    ),
);
