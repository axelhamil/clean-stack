import type { MiddlewareHandler } from "hono";
import { env } from "../env";
import { requireInternalSignature } from "./internal-signature.middleware";
import { requirePrivateNetwork } from "./private-network.middleware";

const HANDLERS: Record<(typeof env.INTERNAL_AUTH_LAYERS)[number], MiddlewareHandler> = {
  signature: requireInternalSignature,
  "private-network": requirePrivateNetwork,
};

export const internalLayers: MiddlewareHandler[] = env.INTERNAL_AUTH_LAYERS.map((l) => HANDLERS[l]);
