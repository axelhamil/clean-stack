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
