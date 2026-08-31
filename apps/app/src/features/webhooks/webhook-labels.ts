import type { WebhookDeliveryStatus } from "./api/webhooks.queries";
import type { EndpointStatus } from "./components/endpoint-row";

// `endpoint-row.tsx` renders the `EndpointStatus` union both as the plain
// badge text (active/paused) and, hard-coded today, inside the
// "auto-disabled" tooltip badge. `satisfies Record<EndpointStatus, string>`
// only proves every status has AN entry — it cannot prove each one points at
// the RIGHT key, so `__tests__/webhook-labels.test.ts` asserts the mapping
// directly. No guard here, deliberately: `status` is computed locally from a
// closed union, so the compiler already proves the lookup exhaustive. The day
// it becomes wire-sourced its type widens to `string` and `tsc` demands a
// guard then — which protects more than a guard nothing calls, and a comment
// claiming a fallback the call site does not have.
export const ENDPOINT_STATUS_KEYS = {
  active: "common:states.endpoint.active",
  paused: "common:states.endpoint.paused",
  "auto-disabled": "common:states.endpoint.autoDisabled",
} as const satisfies Record<EndpointStatus, string>;

const DELIVERY_STATUSES: readonly WebhookDeliveryStatus[] = [
  "pending",
  "success",
  "failed",
  "dead_letter",
];

export function isDeliveryStatus(value: string): value is WebhookDeliveryStatus {
  return (DELIVERY_STATUSES as readonly string[]).includes(value);
}

// Same shape as `ENDPOINT_STATUS_KEYS` above, for the delivery status shown
// on the deliveries table badge (`webhooks.route.tsx`) and interpolated into
// the delivery sheet's status line (`delivery-sheet.tsx`). Both call sites
// read a status off API response data, so the guard is load-bearing here: an
// unrecognized value falls back to the raw code instead of an unsafe index.
export const DELIVERY_STATUS_KEYS = {
  pending: "common:states.delivery.pending",
  success: "common:states.delivery.success",
  failed: "common:states.delivery.failed",
  dead_letter: "common:states.delivery.deadLetter",
} as const satisfies Record<WebhookDeliveryStatus, string>;
