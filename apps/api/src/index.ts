import { Hono } from "hono";
import { cors } from "hono/cors";
import { requestId } from "hono/request-id";
import { secureHeaders } from "hono/secure-headers";
import { env } from "../common/env";
import { logger } from "../common/logger";
import {
  type AuthVariables,
  requireAuth,
  sessionMiddleware,
} from "./adapters/middleware/auth.middleware";
import { errorHandler } from "./adapters/middleware/error.middleware";
import { httpLogger } from "./adapters/middleware/logger.middleware";
import { auth } from "./auth";
import { uploadsRoutes } from "./routes/uploads.routes";

type AppEnv = {
  Variables: AuthVariables & {
    requestId: string;
  };
};

const app = new Hono<AppEnv>();

app.use("*", requestId());
app.use("*", httpLogger);
app.use("*", secureHeaders());
app.use(
  "*",
  cors({
    origin: env.CORS_ORIGIN,
    credentials: true,
  }),
);

app.use("*", sessionMiddleware);

app.on(["GET", "POST"], "/api/auth/*", (c) => auth.handler(c.req.raw));

app.onError(errorHandler);

const routes = app
  .get("/health", (c) => c.json({ status: "ok" as const }))
  .get("/ready", (c) => c.json({ status: "ok" as const }))
  .get("/me", requireAuth, (c) => c.json({ user: c.get("user") }))
  .route("/uploads", uploadsRoutes);

logger.info({ port: env.PORT, env: env.NODE_ENV }, "api ready");

export type AppType = typeof routes;
export default {
  port: env.PORT,
  fetch: app.fetch,
};
