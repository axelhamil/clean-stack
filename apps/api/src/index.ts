import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { logger } from "hono/logger";
import { env } from "../common/env";

const app = new Hono();

app.use("*", logger());

app.get("/health", (c) => c.json({ status: "ok" }));

serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.log(`API listening on http://localhost:${info.port}`);
});
