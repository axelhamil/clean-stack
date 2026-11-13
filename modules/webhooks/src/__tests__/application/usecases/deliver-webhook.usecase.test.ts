import { beforeEach, describe, expect, it } from "bun:test";
import { type IInstrumentation, type ILogger, Option, Result } from "@packages/ddd-kit";
import { mockPort, type PortMock } from "@packages/test/bun";
import { mockInstrumentation } from "@packages/test/bun/instrumentation";
import type { WebhookDeliveryRecord } from "../../../application/ports/repositories/webhook-delivery.port";
import type {
  IWebhookEndpointRepository,
  WebhookEndpointRecord,
} from "../../../application/ports/repositories/webhook-endpoint.port";
import type { ISecretCipher } from "../../../application/ports/services/secret-cipher.port";
import type { IUrlGuard } from "../../../application/ports/services/url-guard.port";
import type {
  IWebhookSender,
  WebhookResponse,
} from "../../../application/ports/services/webhook-sender.port";
import type { IWebhookSigner } from "../../../application/ports/services/webhook-signer.port";
import type { DeliveryOutcome } from "../../../application/services/delivery-policy.service";
import { DeliverWebhookUseCase } from "../../../application/usecases/deliver-webhook/deliver-webhook.usecase";
import { webhookDelivery, webhookEndpoint } from "../../infra/adapters/fixtures";

const MASTER_KEY = new Uint8Array(32);
const SIGNATURE = "t=1700000000,v1=abc";

let endpoints: PortMock<IWebhookEndpointRepository>;
let cipher: PortMock<ISecretCipher>;
let urlGuard: PortMock<IUrlGuard>;
let signer: PortMock<IWebhookSigner>;
let sender: PortMock<IWebhookSender>;
let instrumentation: PortMock<IInstrumentation>;
let masterKey: Option<Uint8Array>;

function useCase() {
  return new DeliverWebhookUseCase(
    endpoints,
    () => masterKey,
    cipher,
    urlGuard,
    signer,
    sender,
    mockPort<ILogger>(),
    instrumentation,
  );
}

async function deliver(
  delivery: WebhookDeliveryRecord = webhookDelivery(),
): Promise<DeliveryOutcome> {
  const result = await useCase().execute({ delivery });

  return result.getValue();
}

function endpointIs(endpoint: WebhookEndpointRecord) {
  endpoints.findEnabledById.mockResolvedValue(Result.ok(Option.some(endpoint)));
}

function responds(response: Partial<WebhookResponse>) {
  sender.send.mockResolvedValue(
    Result.ok({
      status: 200,
      statusText: "OK",
      headers: {},
      body: Option.none(),
      readError: Option.none(),
      ...response,
    }),
  );
}

const verdictOf = ({ verdict }: DeliveryOutcome) => verdict;

describe("DeliverWebhookUseCase", () => {
  beforeEach(() => {
    endpoints = mockPort<IWebhookEndpointRepository>();
    cipher = mockPort<ISecretCipher>();
    urlGuard = mockPort<IUrlGuard>();
    signer = mockPort<IWebhookSigner>();
    sender = mockPort<IWebhookSender>();
    instrumentation = mockInstrumentation();
    masterKey = Option.some(MASTER_KEY);
    endpointIs(webhookEndpoint());
    urlGuard.assertPublic.mockImplementation(async (url) => Result.ok(new URL(url)));
    cipher.open.mockImplementation((sealed) => Result.ok(`plain:${sealed}`));
    signer.sign.mockResolvedValue(SIGNATURE);
    responds({});
  });

  it("keeps the delivery retryable when the endpoint lookup fails", async () => {
    endpoints.findEnabledById.mockResolvedValue(
      Result.fail({ code: "WEBHOOK_PERSISTENCE_PROVIDER_FAILURE", message: "db down" }),
    );

    const outcome = await deliver();

    expect(verdictOf(outcome)).toEqual({
      kind: "failure",
      error: "endpoint lookup db error",
      terminal: false,
    });
    expect(sender.send).not.toHaveBeenCalled();
  });

  it("fails for good when the endpoint is missing or disabled", async () => {
    endpoints.findEnabledById.mockResolvedValue(Result.ok(Option.none()));

    const outcome = await deliver();

    expect(verdictOf(outcome)).toEqual({
      kind: "failure",
      error: "endpoint not found or disabled",
      terminal: true,
    });
    expect(outcome.attempt.isNone()).toBe(true);
    expect(sender.send).not.toHaveBeenCalled();
  });

  it("keeps the delivery retryable with the guard message when the host lookup times out", async () => {
    urlGuard.assertPublic.mockResolvedValue(
      Result.fail({ code: "WEBHOOK_HOST_LOOKUP_TIMEOUT", message: "host lookup timed out" }),
    );

    const outcome = await deliver();

    expect(verdictOf(outcome)).toEqual({
      kind: "failure",
      error: "host lookup timed out",
      terminal: false,
    });
    expect(outcome.organizationId.unwrap()).toBe("org-1");
    expect(sender.send).not.toHaveBeenCalled();
  });

  it("fails for good without sending when the destination is not publicly routable", async () => {
    urlGuard.assertPublic.mockResolvedValue(
      Result.fail({ code: "WEBHOOK_URL_FORBIDDEN", message: "private address" }),
    );

    const outcome = await deliver();

    expect(verdictOf(outcome)).toEqual({
      kind: "failure",
      error: "destination not publicly routable",
      terminal: true,
    });
    const attempt = outcome.attempt.unwrap();
    expect(attempt.requestSent).toBe(false);
    expect(attempt.log.durationMs.unwrap()).toBe(0);
    expect(attempt.log.error.unwrap()).toBe("destination not publicly routable");
    expect(attempt.log.requestHeaders.isNone()).toBe(true);
    expect(attempt.log.responseStatus.isNone()).toBe(true);
    expect(sender.send).not.toHaveBeenCalled();
  });

  it("keeps the delivery retryable when the master key is missing", async () => {
    masterKey = Option.none();

    const outcome = await deliver();

    expect(verdictOf(outcome)).toEqual({
      kind: "failure",
      error: "WEBHOOK_MASTER_KEY missing",
      terminal: false,
    });
    expect(sender.send).not.toHaveBeenCalled();
  });

  it("keeps the delivery retryable and reports the cause when a secret cannot be decrypted", async () => {
    const cause = new Error("bad tag");
    cipher.open.mockReturnValue(Result.fail({ cause }));

    const outcome = await deliver();

    expect(verdictOf(outcome)).toEqual({
      kind: "failure",
      error: "secret decryption failed",
      terminal: false,
    });
    expect(instrumentation.capture).toHaveBeenCalledWith(cause);
    expect(sender.send).not.toHaveBeenCalled();
  });

  it.each([
    ["still live", 3_600_000, ["plain:current-cipher", "plain:previous-cipher"]],
    ["expired", -3_600_000, ["plain:current-cipher"]],
  ])(
    "signs with the previous secret only while it is live (%s)",
    async (_label, offsetMs, secrets) => {
      endpointIs(
        webhookEndpoint({
          previousSecretCipher: Option.some("previous-cipher"),
          previousSecretExpiresAt: Option.some(new Date(Date.now() + offsetMs)),
        }),
      );

      await deliver();

      expect(signer.sign.mock.calls.map(([, signedWith]) => signedWith)).toEqual([secrets]);
    },
  );

  it("posts the signed envelope to the endpoint and records a successful attempt", async () => {
    responds({ headers: { "x-receiver": "ok" }, body: Option.some('{"ok":true}') });

    const outcome = await deliver(webhookDelivery({ attempts: 3 }));

    const [request] = sender.send.mock.calls.map(([sent]) => sent);
    expect(request?.url).toBe("https://example.com/hook");
    expect(request?.headers).toEqual({
      "content-type": "application/json",
      "x-webhook-signature": SIGNATURE,
      "x-webhook-event-id": "evt-1",
      "x-webhook-event-type": "USER_CREATED",
      "x-webhook-idempotency": "idem-1",
    });
    expect(JSON.parse(request?.body ?? "")).toEqual({
      id: "evt-1",
      type: "USER_CREATED",
      data: { userId: "u1" },
      time: "2024-01-01T00:00:00.000Z",
    });
    expect(signer.sign.mock.calls.map(([body]) => body)).toEqual([request?.body ?? ""]);
    expect(verdictOf(outcome)).toEqual({ kind: "success" });
    expect(outcome.responseStatus.unwrap()).toBe(200);
    expect(outcome.organizationId.unwrap()).toBe("org-1");
    const attempt = outcome.attempt.unwrap();
    expect(attempt.requestSent).toBe(true);
    expect(attempt.log.requestHeaders.unwrap()).toEqual(request?.headers ?? {});
    expect(attempt.log.requestBody.unwrap()).toBe(request?.body ?? "");
    expect(attempt.log.responseStatus.unwrap()).toBe(200);
    expect(attempt.log.responseHeaders.unwrap()).toEqual({ "x-receiver": "ok" });
    expect(attempt.log.responseBody.unwrap()).toBe('{"ok":true}');
    expect(attempt.log.error.isNone()).toBe(true);
    expect(attempt.log.durationMs.unwrap()).toBeGreaterThanOrEqual(0);
  });

  it.each([
    [500, "Internal Server Error", {}],
    [307, "Temporary Redirect", { location: "http://10.0.0.1/internal" }],
  ])("fails a %i response as retryable and records it", async (status, statusText, headers) => {
    responds({ status, statusText, headers });

    const outcome = await deliver();

    expect(verdictOf(outcome)).toEqual({
      kind: "failure",
      error: `HTTP ${status}: ${statusText}`,
      terminal: false,
    });
    expect(outcome.responseStatus.unwrap()).toBe(status);
    const attempt = outcome.attempt.unwrap();
    expect(attempt.requestSent).toBe(true);
    expect(attempt.log.responseStatus.unwrap()).toBe(status);
    expect(attempt.log.responseHeaders.unwrapOr({})).toEqual(headers);
    expect(attempt.log.error.unwrap()).toBe(`HTTP ${status}: ${statusText}`);
  });

  it("records the status and headers when the body read fails", async () => {
    responds({
      status: 200,
      headers: { "x-receiver": "ok" },
      readError: Option.some("TypeError: socket closed"),
    });

    const outcome = await deliver();

    expect(verdictOf(outcome)).toEqual({
      kind: "failure",
      error: "TypeError: socket closed",
      terminal: false,
    });
    expect(outcome.responseStatus.unwrap()).toBe(200);
    const attempt = outcome.attempt.unwrap();
    expect(attempt.log.responseStatus.unwrap()).toBe(200);
    expect(attempt.log.responseHeaders.unwrap()).toEqual({ "x-receiver": "ok" });
    expect(attempt.log.error.unwrap()).toBe("TypeError: socket closed");
  });

  it("records a sent attempt without response when the sender fails", async () => {
    sender.send.mockResolvedValue(
      Result.fail({ message: "AbortError: The operation was aborted" }),
    );

    const outcome = await deliver();

    expect(verdictOf(outcome)).toEqual({
      kind: "failure",
      error: "AbortError: The operation was aborted",
      terminal: false,
    });
    const attempt = outcome.attempt.unwrap();
    expect(attempt.requestSent).toBe(true);
    expect(attempt.log.requestHeaders.isSome()).toBe(true);
    expect(attempt.log.responseStatus.isNone()).toBe(true);
    expect(attempt.log.error.unwrap()).toBe("AbortError: The operation was aborted");
  });
});
