import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { logger } from "hono/logger";
import { requestId } from "hono/request-id";
import { secureHeaders } from "hono/secure-headers";
import { z } from "zod";
import { env } from "../common/env";

type AppEnv = {
  Variables: {
    requestId: string;
  };
};

const app = new Hono<AppEnv>();

app.use("*", requestId());
app.use("*", secureHeaders());
app.use(
  "*",
  cors({
    origin: env.CORS_ORIGIN,
    credentials: true,
  }),
);
app.use("*", logger());

app.onError((err, c) => {
  if (err instanceof HTTPException) return err.getResponse();
  console.error(`\x1b[31m✗\x1b[0m ${err.name}: ${err.message}`);
  return c.json({ error: "Internal Server Error" }, 500);
});

const routes = app
  .get("/health", (c) => c.json({ status: "ok" as const }))
  .get("/ready", (c) => c.json({ status: "ok" as const }))
  .post(
    "/newsletter/subscribe",
    zValidator("json", z.object({ email: z.email() })),
    (c) => {
      const { email } = c.req.valid("json");
      return c.json({ ok: true as const, email });
    },
  );

console.log(
  `\x1b[36m▶\x1b[0m api ready · \x1b[1mhttp://localhost:${env.PORT}\x1b[0m`,
);

export type AppType = typeof routes;
export default {
  port: env.PORT,
  fetch: app.fetch,
};
