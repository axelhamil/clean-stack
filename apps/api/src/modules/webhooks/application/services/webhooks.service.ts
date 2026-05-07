import { Buffer } from "node:buffer";
import { type AppError, type IUnitOfWork, Result, uuidv7 } from "@packages/ddd-kit";
import { deriveOrgSubKey, encryptSecret, masterKeyFromHex } from "../../../../shared/aead";
import type { ITransaction } from "../../../../shared/transaction";
import type {
  IWebhookDeliveryRepository,
  WebhookDeliveryRecord,
} from "../ports/webhook-delivery.port";
import type {
  IWebhookEndpointRepository,
  WebhookEndpointRecord,
} from "../ports/webhook-endpoint.port";

export type WebhookSecretGenerator = () => string;
export type MasterKeyProvider = () => Uint8Array | null;

export type WebhookConfigError = AppError<"WEBHOOK_MASTER_KEY_UNAVAILABLE">;

export class WebhooksService {
  constructor(
    private readonly endpoints: IWebhookEndpointRepository,
    private readonly deliveries: IWebhookDeliveryRepository,
    private readonly uow: IUnitOfWork<ITransaction>,
    private readonly masterKey: MasterKeyProvider,
    private readonly secretGen: WebhookSecretGenerator = defaultSecretGenerator,
  ) {}

  async createEndpoint(args: {
    organizationId: string;
    url: string;
    eventTypes: string[];
    enabled: boolean;
  }): Promise<
    Result<{ endpoint: WebhookEndpointRecord; plaintextSecret: string }, WebhookConfigError>
  > {
    const masterKey = this.masterKey();
    if (!masterKey) {
      return Result.fail({
        code: "WEBHOOK_MASTER_KEY_UNAVAILABLE",
        message: "WEBHOOK_MASTER_KEY env var is not configured (64 hex chars)",
      });
    }
    const subKey = deriveOrgSubKey(masterKey, args.organizationId);
    const plaintextSecret = this.secretGen();
    const secretCipher = encryptSecret(plaintextSecret, subKey);

    const endpoint = await this.uow.run(async (tx) =>
      this.endpoints.create(
        {
          id: uuidv7(),
          organizationId: args.organizationId,
          url: args.url,
          secretCipher,
          eventTypes: args.eventTypes,
          enabled: args.enabled,
        },
        tx,
      ),
    );

    return Result.ok({ endpoint, plaintextSecret });
  }

  async updateEndpoint(args: {
    id: string;
    organizationId: string;
    url?: string;
    eventTypes?: string[];
    enabled?: boolean;
  }): Promise<WebhookEndpointRecord | null> {
    return this.uow.run(async (tx) => this.endpoints.update(args, tx));
  }

  async deleteEndpoint(id: string, organizationId: string): Promise<boolean> {
    return this.uow.run(async (tx) => this.endpoints.delete(id, organizationId, tx));
  }

  async listEndpoints(organizationId: string): Promise<WebhookEndpointRecord[]> {
    return this.endpoints.listByOrg(organizationId);
  }

  async findEndpoint(id: string, organizationId: string): Promise<WebhookEndpointRecord | null> {
    return this.endpoints.findById(id, organizationId);
  }

  async listDeliveries(args: {
    endpointId: string;
    organizationId: string;
    status?: WebhookDeliveryRecord["status"];
    limit?: number;
    cursor?: string;
  }) {
    return this.deliveries.list(args);
  }

  async replayDelivery(
    deliveryId: string,
    organizationId: string,
  ): Promise<WebhookDeliveryRecord | null> {
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
  if (!hex) return () => null;
  let cached: Uint8Array | null = null;
  return () => {
    if (cached) return cached;
    cached = masterKeyFromHex(hex);
    return cached;
  };
}
