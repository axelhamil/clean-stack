import { Option, type Result, UnitOfWorkContext } from "@packages/ddd-kit";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import { mockPort, type PortMock } from "@packages/test/bun";
import type { WebhookDeliveryRecord } from "../../../application/ports/repositories/webhook-delivery.port";
import type {
  WebhookEndpointRecord,
  WebhookRepoError,
} from "../../../application/ports/repositories/webhook-endpoint.port";

export const ORG_ID = "org-1";
export const ACTOR_ID = "user-1";
export const ENDPOINT_ID = "ep-1";
export const DELIVERY_ID = "del-1";
export const MASTER_KEY = new Uint8Array(32).fill(7);

export const REPO_DOWN: WebhookRepoError = {
  code: "WEBHOOK_PERSISTENCE_PROVIDER_FAILURE",
  message: "db down",
};

export function endpointRecord(over: Partial<WebhookEndpointRecord> = {}): WebhookEndpointRecord {
  return {
    id: ENDPOINT_ID,
    organizationId: ORG_ID,
    url: "https://example.com/hook",
    secretCipher: "sealed-current",
    eventTypes: ["user.created"],
    enabled: true,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    previousSecretCipher: Option.none(),
    previousSecretExpiresAt: Option.none(),
    consecutiveFailures: 0,
    firstFailedAt: Option.none(),
    disabledAt: Option.none(),
    ...over,
  };
}

export function deliveryRecord(over: Partial<WebhookDeliveryRecord> = {}): WebhookDeliveryRecord {
  return {
    id: DELIVERY_ID,
    endpointId: ENDPOINT_ID,
    outboxEventId: "outbox-1",
    eventType: "user.created",
    payload: { userId: "u1" },
    status: "dead_letter",
    attempts: 4,
    nextAttemptAt: Option.none(),
    lastError: Option.some("connection refused"),
    lastResponseStatus: Option.none(),
    idempotencyKey: "outbox-1:ep-1",
    createdAt: new Date("2026-01-01T00:00:00Z"),
    ...over,
  };
}

export function inTransaction<T>(seen: unknown[], value: Result<T, WebhookRepoError>) {
  return async (): Promise<Result<T, WebhookRepoError>> => {
    seen.push(UnitOfWorkContext.transaction());
    return value;
  };
}

export function recordingOutbox(seen: unknown[]): PortMock<IOutboxRepository> {
  const outbox = mockPort<IOutboxRepository>();
  outbox.enqueue.mockImplementation(async () => {
    seen.push(UnitOfWorkContext.transaction());
  });

  return outbox;
}

export function sealedFor(plaintext: string, organizationId: string): string {
  return `sealed(${plaintext}|${organizationId})`;
}

export function sealUnderMasterKey(plaintext: string, key: Uint8Array, organizationId: string) {
  return key === MASTER_KEY ? sealedFor(plaintext, organizationId) : "sealed-under-wrong-key";
}
