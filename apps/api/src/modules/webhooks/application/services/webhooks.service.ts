import { Buffer } from "node:buffer";
import { type AppError, type IUnitOfWork, Option, Result, uuidv7 } from "@packages/ddd-kit";
import { EventTypes } from "@packages/events";
import { deriveOrgSubKey, encryptSecret, masterKeyFromHex } from "../../../../shared/aead";
import { emitEvent } from "../../../../shared/event-emitter";
import type { IOutboxRepository } from "../../../../shared/ports/outbox.port";
import type { ITransaction } from "../../../../shared/transaction";
import type {
  DeliveryPage,
  IWebhookDeliveryRepository,
  WebhookDeliveryRecord,
} from "../ports/webhook-delivery.port";
import type {
  IWebhookEndpointRepository,
  WebhookEndpointRecord,
  WebhookRepoError,
} from "../ports/webhook-endpoint.port";

export type WebhookSecretGenerator = () => string;
export type MasterKeyProvider = () => Option<Uint8Array>;

export type WebhookConfigError = AppError<"WEBHOOK_MASTER_KEY_UNAVAILABLE">;
export type WebhookServiceError = WebhookConfigError | WebhookRepoError;

export class WebhooksService {
  constructor(
    private readonly endpoints: IWebhookEndpointRepository,
    private readonly deliveries: IWebhookDeliveryRepository,
    private readonly uow: IUnitOfWork<ITransaction>,
    private readonly outbox: IOutboxRepository,
    private readonly masterKey: MasterKeyProvider,
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
    const masterKeyOpt = this.masterKey();
    if (masterKeyOpt.isNone()) {
      return Result.fail({
        code: "WEBHOOK_MASTER_KEY_UNAVAILABLE",
        message: "WEBHOOK_MASTER_KEY env var is not configured (64 hex chars)",
      });
    }
    const subKey = deriveOrgSubKey(masterKeyOpt.unwrap(), args.organizationId);
    const plaintextSecret = this.secretGen();
    const secretCipher = encryptSecret(plaintextSecret, subKey);

    const created = await this.uow.run(async (tx) => {
      const result = await this.endpoints.create(
        {
          id: uuidv7(),
          organizationId: args.organizationId,
          url: args.url,
          secretCipher,
          eventTypes: args.eventTypes,
          enabled: args.enabled,
        },
        tx,
      );
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
        tx,
      );
      return result;
    });
    if (created.isFailure) return Result.fail(created.getError());

    return Result.ok({ endpoint: created.getValue(), plaintextSecret });
  }

  async updateEndpoint(args: {
    id: string;
    organizationId: string;
    actorUserId: string;
    url?: string;
    eventTypes?: string[];
    enabled?: boolean;
  }): Promise<Result<Option<WebhookEndpointRecord>, WebhookServiceError>> {
    return this.uow.run(async (tx) => {
      const updated = await this.endpoints.update(args, tx);
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
        tx,
      );
      return updated;
    });
  }

  async deleteEndpoint(
    id: string,
    organizationId: string,
    actorUserId: string,
  ): Promise<Result<boolean, WebhookServiceError>> {
    return this.uow.run(async (tx) => {
      const deleted = await this.endpoints.delete(id, organizationId, tx);
      if (deleted.isFailure) return deleted;
      if (!deleted.getValue()) return deleted;
      await emitEvent(
        this.outbox,
        EventTypes.WEBHOOK_ENDPOINT_DELETED,
        "webhook_endpoint",
        id,
        { organizationId, actorUserId, endpointId: id },
        { organizationId },
        tx,
      );
      return deleted;
    });
  }

  async listEndpoints(
    organizationId: string,
  ): Promise<Result<WebhookEndpointRecord[], WebhookServiceError>> {
    return this.endpoints.listByOrg(organizationId);
  }

  async findEndpoint(id: string, organizationId: string): Promise<Option<WebhookEndpointRecord>> {
    return this.endpoints.findById(id, organizationId);
  }

  async listDeliveries(args: {
    endpointId: string;
    organizationId: string;
    status?: WebhookDeliveryRecord["status"];
    limit?: number;
    cursor?: string;
  }): Promise<Result<DeliveryPage, WebhookServiceError>> {
    return this.deliveries.list(args);
  }

  async replayDelivery(
    deliveryId: string,
    organizationId: string,
  ): Promise<Result<Option<WebhookDeliveryRecord>, WebhookServiceError>> {
    return this.uow.run(async (tx) =>
      this.deliveries.enqueueReplay(deliveryId, organizationId, tx),
    );
  }
}

function defaultSecretGenerator(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return `whsec_${Buffer.from(bytes).toString("base64url")}`;
}

export function masterKeyProvider(hex: string | undefined): MasterKeyProvider {
  if (!hex) return () => Option.none();
  let cached: Option<Uint8Array> | null = null;
  return () => {
    if (cached) return cached;
    cached = Option.some(masterKeyFromHex(hex));
    return cached;
  };
}
