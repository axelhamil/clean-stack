import type { IInstrumentation, ILogger, IUnitOfWork } from "@packages/ddd-kit";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import { defineModule } from "inwire";
import type { WebhookSettings } from "./application/config/webhook-settings";
import type { IWebhookDeliveryRepository } from "./application/ports/repositories/webhook-delivery.port";
import type { IWebhookEndpointRepository } from "./application/ports/repositories/webhook-endpoint.port";
import type { MasterKeyProvider } from "./application/ports/services/master-key.port";
import type { ISecretCipher } from "./application/ports/services/secret-cipher.port";
import type { ISecretGenerator } from "./application/ports/services/secret-generator.port";
import type { IUrlGuard } from "./application/ports/services/url-guard.port";
import type { IWebhookSender } from "./application/ports/services/webhook-sender.port";
import type { IWebhookSigner } from "./application/ports/services/webhook-signer.port";
import type { ICountDeadLettersQuery } from "./application/queries/count-dead-letters.query";
import type { IGetDeliveryQuery } from "./application/queries/get-delivery.query";
import type { IListDeliveriesQuery } from "./application/queries/list-deliveries.query";
import type { IListEndpointsQuery } from "./application/queries/list-endpoints.query";
import { TestDeliveryService } from "./application/services/test-delivery.service";
import { WebhooksService } from "./application/services/webhooks.service";
import { CreateEndpointUseCase } from "./application/usecases/create-endpoint/create-endpoint.usecase";
import { DeleteEndpointUseCase } from "./application/usecases/delete-endpoint/delete-endpoint.usecase";
import { DeliverWebhookUseCase } from "./application/usecases/deliver-webhook/deliver-webhook.usecase";
import { FanOutEventToEndpointsUseCase } from "./application/usecases/fan-out-event-to-endpoints/fan-out-event-to-endpoints.usecase";
import { ReplayDeliveryUseCase } from "./application/usecases/replay-delivery/replay-delivery.usecase";
import { RotateEndpointSecretUseCase } from "./application/usecases/rotate-endpoint-secret/rotate-endpoint-secret.usecase";
import { SendTestDeliveryUseCase } from "./application/usecases/send-test-delivery/send-test-delivery.usecase";
import { SettleDeliveryUseCase } from "./application/usecases/settle-delivery/settle-delivery.usecase";
import { UpdateEndpointUseCase } from "./application/usecases/update-endpoint/update-endpoint.usecase";
import { aeadSecretCipher, masterKeyProvider } from "./infra/adapters/aead-secret-cipher.adapter";
import { FetchWebhookSender } from "./infra/adapters/fetch-webhook-sender.adapter";
import { hmacWebhookSigner } from "./infra/adapters/hmac-signer.adapter";
import { randomSecretGenerator } from "./infra/adapters/random-secret-generator.adapter";
import { dnsUrlGuard } from "./infra/adapters/ssrf-guard.adapter";
import { WebhookDeliveryWorker } from "./infra/adapters/webhook-delivery-worker.adapter";
import { WebhookFanoutSubscriber } from "./infra/adapters/webhook-fanout-subscriber.adapter";
import { DrizzleCountDeadLettersQuery } from "./infra/queries/count-dead-letters.query";
import { DrizzleGetDeliveryQuery } from "./infra/queries/get-delivery.query";
import { DrizzleListDeliveriesQuery } from "./infra/queries/list-deliveries.query";
import { DrizzleListEndpointsQuery } from "./infra/queries/list-endpoints.query";
import { DrizzleWebhookDeliveryRepository } from "./infra/repos/drizzle/webhook-delivery.repository";
import { DrizzleWebhookEndpointRepository } from "./infra/repos/drizzle/webhook-endpoint.repository";

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
    .add("ISecretCipher", (): ISecretCipher => aeadSecretCipher)
    .add("ISecretGenerator", (): ISecretGenerator => randomSecretGenerator)
    .add("IWebhookSigner", (): IWebhookSigner => hmacWebhookSigner)
    .add(
      "IWebhookSender",
      (c): IWebhookSender =>
        new FetchWebhookSender(c.IInstrumentation, c.webhookSettings.delivery.responseCaptureBytes),
    )
    .add(
      "IListEndpointsQuery",
      (c): IListEndpointsQuery => new DrizzleListEndpointsQuery(c.IInstrumentation, c.ILogger),
    )
    .add(
      "IListDeliveriesQuery",
      (c): IListDeliveriesQuery => new DrizzleListDeliveriesQuery(c.IInstrumentation, c.ILogger),
    )
    .add(
      "IGetDeliveryQuery",
      (c): IGetDeliveryQuery => new DrizzleGetDeliveryQuery(c.IInstrumentation, c.ILogger),
    )
    .add(
      "ICountDeadLettersQuery",
      (c): ICountDeadLettersQuery =>
        new DrizzleCountDeadLettersQuery(c.IInstrumentation, c.ILogger),
    )
    .add(
      "TestDeliveryService",
      (c) =>
        new TestDeliveryService(
          c.IWebhookEndpointRepository,
          c.IWebhookDeliveryRepository,
          c.ITransactionService,
          c.IOutboxRepository,
        ),
    )
    .add(
      "CreateEndpointUseCase",
      (c) =>
        new CreateEndpointUseCase(
          c.IWebhookEndpointRepository,
          c.TestDeliveryService,
          c.ITransactionService,
          c.IOutboxRepository,
          c.WebhookMasterKey,
          c.ISecretCipher,
          c.ISecretGenerator,
          c.IUrlGuard,
          c.ILogger,
          c.IInstrumentation,
        ),
    )
    .add(
      "UpdateEndpointUseCase",
      (c) =>
        new UpdateEndpointUseCase(
          c.IWebhookEndpointRepository,
          c.ITransactionService,
          c.IOutboxRepository,
          c.IUrlGuard,
        ),
    )
    .add(
      "DeleteEndpointUseCase",
      (c) =>
        new DeleteEndpointUseCase(
          c.IWebhookEndpointRepository,
          c.ITransactionService,
          c.IOutboxRepository,
        ),
    )
    .add("SendTestDeliveryUseCase", (c) => new SendTestDeliveryUseCase(c.TestDeliveryService))
    .add(
      "RotateEndpointSecretUseCase",
      (c) =>
        new RotateEndpointSecretUseCase(
          c.IWebhookEndpointRepository,
          c.ITransactionService,
          c.IOutboxRepository,
          c.WebhookMasterKey,
          c.ISecretCipher,
          c.ISecretGenerator,
          { secretGraceHours: c.webhookSettings.secretGraceHours },
        ),
    )
    .add(
      "ReplayDeliveryUseCase",
      (c) =>
        new ReplayDeliveryUseCase(
          c.IWebhookEndpointRepository,
          c.IWebhookDeliveryRepository,
          c.ITransactionService,
          c.IOutboxRepository,
        ),
    )
    .add(
      "DeliverWebhookUseCase",
      (c) =>
        new DeliverWebhookUseCase(
          c.IWebhookEndpointRepository,
          c.WebhookMasterKey,
          c.ISecretCipher,
          c.IUrlGuard,
          c.IWebhookSigner,
          c.IWebhookSender,
          c.ILogger,
          c.IInstrumentation,
        ),
    )
    .add(
      "SettleDeliveryUseCase",
      (c) =>
        new SettleDeliveryUseCase(
          c.IWebhookDeliveryRepository,
          c.IWebhookEndpointRepository,
          c.ITransactionService,
          c.IOutboxRepository,
          c.ILogger,
          c.webhookSettings.delivery,
        ),
    )
    .add(
      "FanOutEventToEndpointsUseCase",
      (c) =>
        new FanOutEventToEndpointsUseCase(
          c.IWebhookEndpointRepository,
          c.IWebhookDeliveryRepository,
          c.ITransactionService,
        ),
    )
    .add(
      "WebhooksService",
      (c) => new WebhooksService(c.ICountDeadLettersQuery, c.IInstrumentation),
    )
    .add(
      "WebhookFanoutSubscriber",
      (c) => new WebhookFanoutSubscriber(c.FanOutEventToEndpointsUseCase, c.IInstrumentation),
    )
    .add(
      "WebhookDeliveryWorker",
      (c) =>
        new WebhookDeliveryWorker(
          c.IWebhookDeliveryRepository,
          c.DeliverWebhookUseCase,
          c.SettleDeliveryUseCase,
          c.ILogger,
          c.IInstrumentation,
          c.webhookSettings.delivery,
        ),
    ),
);
