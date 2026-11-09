import { Buffer } from "node:buffer";
import {
  type AppError,
  type IInstrumentation,
  type ILogger,
  type IUnitOfWork,
  Option,
  Result,
  uuidv7,
} from "@packages/ddd-kit";
import { EventTypes } from "@packages/events";
import { emitEvent } from "@packages/outbox/event-emitter";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import type { WebhookDeliverySettings, WebhookSettings } from "../config/webhook-settings";
import type { ISecretCipher } from "../ports/secret-cipher.port";
import type {
  DeliveryPage,
  IWebhookDeliveryRepository,
  WebhookDeliveryAttemptRecord,
  WebhookDeliveryRecord,
} from "../ports/webhook-delivery.port";
import type {
  IWebhookEndpointRepository,
  WebhookEndpointRecord,
  WebhookRepoError,
} from "../ports/webhook-endpoint.port";
import { assertPublicUrl } from "./ssrf-guard";

export type WebhookSecretGenerator = () => string;
export type MasterKeyProvider = () => Option<Uint8Array>;

export type WebhookConfigError = AppError<"WEBHOOK_MASTER_KEY_UNAVAILABLE">;
export type WebhookServiceError =
  | WebhookConfigError
  | WebhookRepoError
  | AppError<"WEBHOOK_URL_FORBIDDEN">;

export class WebhooksService {
  constructor(
    private readonly endpoints: IWebhookEndpointRepository,
    private readonly deliveries: IWebhookDeliveryRepository,
    private readonly uow: IUnitOfWork,
    private readonly outbox: IOutboxRepository,
    private readonly masterKey: MasterKeyProvider,
    private readonly instrumentation: IInstrumentation,
    private readonly cipher: ISecretCipher,
    private readonly logger: ILogger,
    private readonly settings: Pick<WebhookSettings, "secretGraceHours"> &
      Pick<WebhookDeliverySettings, "httpsOnly">,
    private readonly secretGen: WebhookSecretGenerator = defaultSecretGenerator,
  ) {}

  async createEndpoint(args: {
    organizationId: string;
    actorUserId: string;
    url: string;
    eventTypes: string[];
    enabled: boolean;
  }): Promise<
    Result<{ endpoint: WebhookEndpointRecord; plaintextSecret: string }, WebhookServiceError>
  > {
    return this.instrumentation.startSpan(
      { name: "WebhooksService > createEndpoint", op: "function" },
      async () => {
        const guard = await assertPublicUrl(args.url, undefined, this.settings.httpsOnly);
        if (guard.isFailure)
          return Result.fail({ code: "WEBHOOK_URL_FORBIDDEN", message: guard.getError().message });

        const masterKeyOpt = this.masterKey();
        if (masterKeyOpt.isNone()) {
          return Result.fail({
            code: "WEBHOOK_MASTER_KEY_UNAVAILABLE",
            message: "WEBHOOK_MASTER_KEY env var is not configured (64 hex chars)",
          });
        }
        const plaintextSecret = this.secretGen();
        const secretCipher = this.cipher.seal(
          plaintextSecret,
          masterKeyOpt.unwrap(),
          args.organizationId,
        );

        const created = await this.uow.run(async () => {
          const result = await this.endpoints.create({
            id: uuidv7(),
            organizationId: args.organizationId,
            url: args.url,
            secretCipher,
            eventTypes: args.eventTypes,
            enabled: args.enabled,
          });
          if (result.isFailure) return result;
          const endpoint = result.getValue();
          await emitEvent(
            this.outbox,
            EventTypes.WEBHOOK_ENDPOINT_CREATED,
            "webhook_endpoint",
            endpoint.id,
            {
              organizationId: endpoint.organizationId,
              actorUserId: args.actorUserId,
              endpointId: endpoint.id,
              url: endpoint.url,
              eventTypes: endpoint.eventTypes,
              enabled: endpoint.enabled,
            },
            { organizationId: endpoint.organizationId },
          );
          return result;
        });
        if (created.isFailure) return Result.fail(created.getError());

        const endpoint = created.getValue();
        await this.sendTest({
          id: endpoint.id,
          organizationId: args.organizationId,
          actorUserId: args.actorUserId,
        }).then(
          (tested) => {
            if (tested.isFailure)
              this.logger.warn(
                { endpointId: endpoint.id, code: tested.getError().code },
                "webhook endpoint created but its test delivery failed",
              );
          },
          (err) => this.instrumentation.capture(err),
        );

        return Result.ok({ endpoint, plaintextSecret });
      },
    );
  }

  async updateEndpoint(args: {
    id: string;
    organizationId: string;
    actorUserId: string;
    url?: string;
    eventTypes?: string[];
    enabled?: boolean;
  }): Promise<Result<Option<WebhookEndpointRecord>, WebhookServiceError>> {
    return this.instrumentation.startSpan(
      { name: "WebhooksService > updateEndpoint", op: "function" },
      async () => {
        if (args.url !== undefined) {
          const guard = await assertPublicUrl(args.url, undefined, this.settings.httpsOnly);
          if (guard.isFailure)
            return Result.fail({
              code: "WEBHOOK_URL_FORBIDDEN",
              message: guard.getError().message,
            });
        }
        return this.uow.run(async () => {
          const updated = await this.endpoints.update(args);
          if (updated.isFailure) return updated;
          const opt = updated.getValue();
          if (opt.isNone()) return updated;
          const changes: Record<string, unknown> = {};
          if (args.url !== undefined) changes.url = args.url;
          if (args.eventTypes !== undefined) changes.eventTypes = args.eventTypes;
          if (args.enabled !== undefined) changes.enabled = args.enabled;
          await emitEvent(
            this.outbox,
            EventTypes.WEBHOOK_ENDPOINT_UPDATED,
            "webhook_endpoint",
            args.id,
            {
              organizationId: args.organizationId,
              actorUserId: args.actorUserId,
              endpointId: args.id,
              changes,
            },
            { organizationId: args.organizationId },
          );
          return updated;
        });
      },
    );
  }

  async deleteEndpoint(
    id: string,
    organizationId: string,
    actorUserId: string,
  ): Promise<Result<boolean, WebhookServiceError>> {
    return this.instrumentation.startSpan(
      { name: "WebhooksService > deleteEndpoint", op: "function" },
      async () =>
        this.uow.run(async () => {
          const deleted = await this.endpoints.delete(id, organizationId);
          if (deleted.isFailure) return deleted;
          if (!deleted.getValue()) return deleted;
          await emitEvent(
            this.outbox,
            EventTypes.WEBHOOK_ENDPOINT_DELETED,
            "webhook_endpoint",
            id,
            { organizationId, actorUserId, endpointId: id },
            { organizationId },
          );
          return deleted;
        }),
    );
  }

  async listEndpoints(
    organizationId: string,
  ): Promise<Result<WebhookEndpointRecord[], WebhookServiceError>> {
    return this.instrumentation.startSpan(
      { name: "WebhooksService > listEndpoints", op: "function" },
      () => this.endpoints.listByOrg(organizationId),
    );
  }

  async findEndpoint(
    id: string,
    organizationId: string,
  ): Promise<Result<Option<WebhookEndpointRecord>, WebhookServiceError>> {
    return this.instrumentation.startSpan(
      { name: "WebhooksService > findEndpoint", op: "function" },
      () => this.endpoints.findById(id, organizationId),
    );
  }

  async listDeliveries(args: {
    endpointId: string;
    organizationId: string;
    status?: WebhookDeliveryRecord["status"];
    limit?: number;
    cursor?: string;
  }): Promise<Result<DeliveryPage, WebhookServiceError>> {
    return this.instrumentation.startSpan(
      { name: "WebhooksService > listDeliveries", op: "function" },
      () => this.deliveries.list(args),
    );
  }

  async findDelivery(
    id: string,
    endpointId: string,
    organizationId: string,
  ): Promise<
    Result<
      Option<WebhookDeliveryRecord & { attemptHistory: WebhookDeliveryAttemptRecord[] }>,
      WebhookServiceError
    >
  > {
    return this.instrumentation.startSpan(
      { name: "WebhooksService > findDelivery", op: "function" },
      () => this.deliveries.findByIdWithAttempts(id, endpointId, organizationId),
    );
  }

  async replayDelivery(
    deliveryId: string,
    endpointId: string,
    organizationId: string,
    actorUserId: string,
  ): Promise<Result<Option<WebhookDeliveryRecord>, WebhookServiceError>> {
    return this.instrumentation.startSpan(
      { name: "WebhooksService > replayDelivery", op: "function" },
      async () =>
        this.uow.run(async () => {
          const replayed = await this.deliveries.enqueueReplay(
            deliveryId,
            endpointId,
            organizationId,
          );
          if (replayed.isFailure) return replayed;
          const opt = replayed.getValue();
          if (opt.isNone()) return replayed;

          await emitEvent(
            this.outbox,
            EventTypes.WEBHOOK_DELIVERY_REPLAYED,
            "webhook_delivery",
            deliveryId,
            {
              organizationId,
              endpointId,
              deliveryId,
              replayedDeliveryId: opt.unwrap().id,
              actorUserId,
            },
            { organizationId },
          );
          return replayed;
        }),
    );
  }

  async sendTest(args: {
    id: string;
    organizationId: string;
    actorUserId: string;
  }): Promise<Result<Option<WebhookDeliveryRecord>, WebhookServiceError>> {
    return this.instrumentation.startSpan(
      { name: "WebhooksService > sendTest", op: "function" },
      async () => {
        const found = await this.endpoints.findById(args.id, args.organizationId);
        if (found.isFailure) return Result.fail(found.getError());
        if (found.getValue().isNone()) return Result.ok(Option.none());
        return this.uow.run(async () => {
          const outboxEventId = await emitEvent(
            this.outbox,
            EventTypes.WEBHOOK_TEST,
            "webhook_endpoint",
            args.id,
            {
              organizationId: args.organizationId,
              endpointId: args.id,
              actorUserId: args.actorUserId,
            },
            { organizationId: args.organizationId },
          );
          const delivery = await this.deliveries.enqueueTargeted({
            endpointId: args.id,
            outboxEventId,
            eventType: EventTypes.WEBHOOK_TEST,
            payload: {
              organizationId: args.organizationId,
              endpointId: args.id,
              actorUserId: args.actorUserId,
            },
            idempotencyKey: `test:${outboxEventId}`,
          });
          if (delivery.isFailure) return Result.fail(delivery.getError());
          return Result.ok(Option.some(delivery.getValue()));
        });
      },
    );
  }

  async rotateSecret(args: {
    id: string;
    organizationId: string;
    actorUserId: string;
  }): Promise<
    Result<
      Option<{ endpoint: WebhookEndpointRecord; plaintextSecret: string }>,
      WebhookServiceError
    >
  > {
    return this.instrumentation.startSpan(
      { name: "WebhooksService > rotateSecret", op: "function" },
      async () => {
        const masterKeyOpt = this.masterKey();
        if (masterKeyOpt.isNone()) {
          return Result.fail({
            code: "WEBHOOK_MASTER_KEY_UNAVAILABLE",
            message: "WEBHOOK_MASTER_KEY env var is not configured (64 hex chars)",
          });
        }
        const found = await this.endpoints.findById(args.id, args.organizationId);
        if (found.isFailure) return Result.fail(found.getError());
        const endpoint = found.getValue();
        if (endpoint.isNone()) return Result.ok(Option.none());

        const newPlaintext = this.secretGen();
        const newCipher = this.cipher.seal(
          newPlaintext,
          masterKeyOpt.unwrap(),
          args.organizationId,
        );
        const previousSecretExpiresAt = new Date(
          Date.now() + this.settings.secretGraceHours * 3_600_000,
        );

        const rotated = await this.uow.run(async () => {
          const result = await this.endpoints.applySecretRotation({
            id: args.id,
            organizationId: args.organizationId,
            secretCipher: newCipher,
            previousSecretCipher: endpoint.unwrap().secretCipher,
            previousSecretExpiresAt,
          });
          if (result.isFailure) return result;
          await emitEvent(
            this.outbox,
            EventTypes.WEBHOOK_ENDPOINT_SECRET_ROTATED,
            "webhook_endpoint",
            args.id,
            {
              organizationId: args.organizationId,
              endpointId: args.id,
              actorUserId: args.actorUserId,
            },
            { organizationId: args.organizationId },
          );
          return result;
        });
        if (rotated.isFailure) return Result.fail(rotated.getError());
        const rotatedOpt = rotated.getValue();
        if (rotatedOpt.isNone()) return Result.ok(Option.none());
        return Result.ok(
          Option.some({ endpoint: rotatedOpt.unwrap(), plaintextSecret: newPlaintext }),
        );
      },
    );
  }
}

function defaultSecretGenerator(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return `whsec_${Buffer.from(bytes).toString("base64url")}`;
}
