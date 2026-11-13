import { Option } from "@packages/ddd-kit";
import { failureSchedule } from "@packages/outbox/jitter";
import type { WebhookDeliverySettings } from "../config/webhook-settings";
import type {
  DeliveryFailure,
  WebhookDeliveryAttemptRecord,
  WebhookDeliveryRecord,
} from "../ports/repositories/webhook-delivery.port";
import type {
  EndpointFailureStreak,
  WebhookEndpointRecord,
} from "../ports/repositories/webhook-endpoint.port";

export const WEBHOOK_MAX_ATTEMPTS = 4;

export type AttemptLog = Omit<
  WebhookDeliveryAttemptRecord,
  "id" | "createdAt" | "deliveryId" | "attemptNumber"
>;

export type DeliveryVerdict =
  | { kind: "success" }
  | { kind: "failure"; error: string; terminal: boolean };

export type DeliveryOutcome = {
  verdict: DeliveryVerdict;
  responseStatus: Option<number>;
  organizationId: Option<string>;
  attempt: Option<{ log: AttemptLog; requestSent: boolean }>;
};

export function failedOutcome(
  error: string,
  overrides: Partial<Omit<DeliveryOutcome, "verdict">> & { terminal?: boolean } = {},
): DeliveryOutcome {
  return {
    verdict: { kind: "failure", error, terminal: overrides.terminal ?? false },
    responseStatus: overrides.responseStatus ?? Option.none(),
    organizationId: overrides.organizationId ?? Option.none(),
    attempt: overrides.attempt ?? Option.none(),
  };
}

export function errorText(err: unknown): string {
  return err instanceof Error ? `${err.name}: ${err.message}` : String(err);
}

export function liveSecretCiphers(endpoint: WebhookEndpointRecord, now: Date): string[] {
  const previousIsLive =
    endpoint.previousSecretCipher.isSome() &&
    endpoint.previousSecretExpiresAt.isSome() &&
    endpoint.previousSecretExpiresAt.unwrap() > now;

  if (!previousIsLive) return [endpoint.secretCipher];

  return [endpoint.secretCipher, endpoint.previousSecretCipher.unwrap()];
}

export function deliveryFailure(
  delivery: WebhookDeliveryRecord,
  error: string,
  responseStatus: Option<number>,
  terminal: boolean,
  deadRetrySeconds: number,
): DeliveryFailure {
  const base = { lastError: error, lastResponseStatus: responseStatus };
  if (terminal) return { ...base, status: "dead_letter", retryAfterSeconds: Option.none() };

  const { dead, retryAfterSeconds } = failureSchedule(delivery.attempts, {
    wasDead: delivery.status === "dead_letter",
    maxAttempts: WEBHOOK_MAX_ATTEMPTS,
    deadRetrySeconds,
  });

  return {
    ...base,
    status: dead ? "dead_letter" : "failed",
    retryAfterSeconds: Option.some(retryAfterSeconds),
  };
}

export function shouldAutoDisable(
  { consecutiveFailures, firstFailedAt }: EndpointFailureStreak,
  now: Date,
  {
    autoDisableMinFailures,
    autoDisableAfterDays,
  }: Pick<WebhookDeliverySettings, "autoDisableMinFailures" | "autoDisableAfterDays">,
): boolean {
  return (
    consecutiveFailures >= autoDisableMinFailures &&
    now.getTime() - firstFailedAt.getTime() > autoDisableAfterDays * 86_400_000
  );
}
