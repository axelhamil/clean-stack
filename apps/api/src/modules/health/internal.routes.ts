// `/internal/build-info` — gated by signed HMAC + optional private-network (env-driven). Never exposed to public traffic.

import { Hono } from "hono";
import { internalLayers } from "../../shared/internal-routes/internal-layers";
import { buildInfo } from "./routes";

export const healthInternalRoutes = new Hono()
  .use("*", ...internalLayers)
  .get("/build-info", (c) => c.json(buildInfo()));
