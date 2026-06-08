/**
 * Env-driven composer for `/internal/*` auth layers.
 *
 * `INTERNAL_AUTH_LAYERS` selects which guards to apply — `"signature"` (HMAC,
 * safe for public deployments) or `"private-network"` (RFC1918 loopback gate,
 * for closed networks). Defaults to `["signature"]`. Spread `internalLayers`
 * as middleware args so routes don't hard-code a specific strategy.
 */
import type { MiddlewareHandler } from "hono";
import { env } from "../env";
import { requireInternalSignature } from "./internal-signature.middleware";
import { requirePrivateNetwork } from "./private-network.middleware";

type InternalLayer = "signature" | "private-network";

const HANDLERS: Record<InternalLayer, MiddlewareHandler> = {
  signature: requireInternalSignature,
  "private-network": requirePrivateNetwork,
};

export const internalLayers: MiddlewareHandler[] = (env.INTERNAL_AUTH_LAYERS ?? ["signature"]).map(
  (l) => HANDLERS[l],
);
