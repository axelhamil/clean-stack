import { Hono } from "hono";
import { cors } from "hono/cors";
import { requestId } from "hono/request-id";
import { secureHeaders } from "hono/secure-headers";
import { auth } from "./auth";
import { rgpdInternalRoutes } from "./modules/rgpd/internal.routes";
import { rgpdMeRoutes } from "./modules/rgpd/routes";
import { uploadsRoutes } from "./modules/uploads/routes";
import { env } from "./shared/env";
import { logger } from "./shared/logger";
import {
  type AuthVariables,
  requireAuth,
  sessionMiddleware,
} from "./shared/middleware/auth.middleware";
import { errorHandler } from "./shared/middleware/error.middleware";
import { httpLogger } from "./shared/middleware/logger.middleware";

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
    origin: env.CORS_ORIGIN ?? ["http://localhost:5173"],
    credentials: true,
  }),
);

app.use("*", sessionMiddleware);

app.on(["GET", "POST"], "/api/auth/*", (c) => auth.handler(c.req.raw));

app.route("/internal", rgpdInternalRoutes);

const routes = app
  .get("/health", (c) => c.json({ status: "ok" as const }))
  .get("/ready", (c) => c.json({ status: "ok" as const }))
  .get("/me", requireAuth, (c) => c.json({ user: c.get("user") }))
  .route("/me", rgpdMeRoutes)
  .route("/uploads", uploadsRoutes);

app.onError(errorHandler);

logger.info({ port: env.PORT, env: env.NODE_ENV }, "api ready");

export type AppType = typeof routes;
export default {
  port: env.PORT,
  fetch: app.fetch,
};
