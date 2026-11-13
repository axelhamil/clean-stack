import {
  type IInstrumentation,
  type ILogger,
  type IUseCase,
  Option,
  Result,
} from "@packages/ddd-kit";
import { toWebhookBody, toWebhookHeaders } from "../../mappers/webhook-request.mapper";
import type { WebhookDeliveryRecord } from "../../ports/repositories/webhook-delivery.port";
import type {
  IWebhookEndpointRepository,
  WebhookEndpointRecord,
} from "../../ports/repositories/webhook-endpoint.port";
import type { MasterKeyProvider } from "../../ports/services/master-key.port";
import type { ISecretCipher } from "../../ports/services/secret-cipher.port";
import type { IUrlGuard } from "../../ports/services/url-guard.port";
import type { IWebhookSender } from "../../ports/services/webhook-sender.port";
import type { IWebhookSigner } from "../../ports/services/webhook-signer.port";
import {
  type DeliveryOutcome,
  failedOutcome,
  liveSecretCiphers,
} from "../../services/delivery-policy.service";
import type { DeliverWebhookInput } from "./deliver-webhook.dto";

const UNROUTABLE = "destination not publicly routable";

export class DeliverWebhookUseCase
  implements IUseCase<DeliverWebhookInput, DeliveryOutcome, never>
{
  constructor(
    private readonly endpoints: IWebhookEndpointRepository,
    private readonly masterKey: MasterKeyProvider,
    private readonly cipher: ISecretCipher,
    private readonly urlGuard: IUrlGuard,
    private readonly signer: IWebhookSigner,
    private readonly sender: IWebhookSender,
    private readonly logger: ILogger,
    private readonly instrumentation: IInstrumentation,
  ) {}

  async execute({ delivery }: DeliverWebhookInput): Promise<Result<DeliveryOutcome, never>> {
    return Result.ok(await this.deliver(delivery));
  }

  private async deliver(delivery: WebhookDeliveryRecord): Promise<DeliveryOutcome> {
    const lookup = await this.endpoints.findEnabledById(delivery.endpointId);
    if (lookup.isFailure) return failedOutcome("endpoint lookup db error");
    const enabled = lookup.getValue();
    if (enabled.isNone())
      return failedOutcome("endpoint not found or disabled", { terminal: true });

    const endpoint = enabled.unwrap();
    const organizationId = Option.some(endpoint.organizationId);

    const guard = await this.urlGuard.assertPublic(endpoint.url);
    if (guard.isFailure && guard.getError().code === "WEBHOOK_HOST_LOOKUP_TIMEOUT") {
      return failedOutcome(guard.getError().message, { organizationId });
    }
    if (guard.isFailure) return unroutableOutcome(organizationId);

    const masterKey = this.masterKey();
    if (masterKey.isNone()) return failedOutcome("WEBHOOK_MASTER_KEY missing", { organizationId });

    const secrets = this.openSecrets(delivery, endpoint, masterKey.unwrap());
    if (secrets.isNone()) return failedOutcome("secret decryption failed", { organizationId });

    return this.send(delivery, endpoint, secrets.unwrap(), organizationId);
  }

  private openSecrets(
    delivery: WebhookDeliveryRecord,
    endpoint: WebhookEndpointRecord,
    masterKey: Uint8Array,
  ): Option<string[]> {
    const secrets: string[] = [];
    for (const sealed of liveSecretCiphers(endpoint, new Date())) {
      const opened = this.cipher.open(sealed, masterKey, endpoint.organizationId);
      if (opened.isFailure) {
        const err = opened.getError().cause;
        this.logger.error(
          { err, deliveryId: delivery.id, endpointId: endpoint.id },
          "webhook secret decryption failed",
        );
        this.instrumentation.capture(err);
        return Option.none();
      }
      secrets.push(opened.getValue());
    }

    return Option.some(secrets);
  }

  private async send(
    delivery: WebhookDeliveryRecord,
    endpoint: WebhookEndpointRecord,
    secrets: string[],
    organizationId: Option<string>,
  ): Promise<DeliveryOutcome> {
    const body = toWebhookBody(delivery);
    const signature = await this.signer.sign(body, secrets, Math.floor(Date.now() / 1000));
    const headers = toWebhookHeaders(delivery, signature);

    const startedAt = Date.now();
    const sent = await this.sender.send({ url: endpoint.url, headers, body });
    const durationMs = Option.some(Date.now() - startedAt);

    if (sent.isFailure) {
      const error = sent.getError().message;
      const attempt = Option.some({
        requestSent: true,
        log: {
          requestHeaders: Option.some(headers),
          requestBody: Option.some(body),
          responseStatus: Option.none<number>(),
          responseHeaders: Option.none<Record<string, string>>(),
          responseBody: Option.none<string>(),
          durationMs,
          error: Option.some(error),
        },
      });

      return failedOutcome(error, { organizationId, attempt });
    }

    const response = sent.getValue();
    const responseStatus = Option.some(response.status);
    const ok = response.status >= 200 && response.status <= 299;
    const error = response.readError.isSome()
      ? response.readError
      : ok
        ? Option.none<string>()
        : Option.some(`HTTP ${response.status}: ${response.statusText}`);
    const attempt = Option.some({
      requestSent: true,
      log: {
        requestHeaders: Option.some(headers),
        requestBody: Option.some(body),
        responseStatus,
        responseHeaders:
          Object.keys(response.headers).length > 0
            ? Option.some(response.headers)
            : Option.none<Record<string, string>>(),
        responseBody: response.body,
        durationMs,
        error,
      },
    });

    if (error.isSome())
      return failedOutcome(error.unwrap(), { responseStatus, organizationId, attempt });

    return { verdict: { kind: "success" }, responseStatus, organizationId, attempt };
  }
}

function unroutableOutcome(organizationId: Option<string>): DeliveryOutcome {
  return failedOutcome(UNROUTABLE, {
    terminal: true,
    organizationId,
    attempt: Option.some({
      requestSent: false,
      log: {
        requestHeaders: Option.none(),
        requestBody: Option.none(),
        responseStatus: Option.none(),
        responseHeaders: Option.none(),
        responseBody: Option.none(),
        durationMs: Option.some(0),
        error: Option.some(UNROUTABLE),
      },
    }),
  });
}
