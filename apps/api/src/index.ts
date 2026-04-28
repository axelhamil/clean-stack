import { Hono } from "hono";
import { logger } from "hono/logger";
import { env } from "../common/env";

const app = new Hono();

app.use("*", logger());

app.onError((err, c) => {
  console.error(`\x1b[31m✗\x1b[0m ${err.name}: ${err.message}`);
  return c.json({ error: "Internal Server Error" }, 500);
});

app.get("/health", (c) => c.json({ status: "ok" }));

console.log(
  `\x1b[36m▶\x1b[0m api ready · \x1b[1mhttp://localhost:${env.PORT}\x1b[0m`,
);

export default {
  port: env.PORT,
  fetch: app.fetch,
};
