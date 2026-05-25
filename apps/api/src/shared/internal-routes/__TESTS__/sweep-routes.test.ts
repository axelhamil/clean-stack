import { describe, expect, it } from "bun:test";
import { Hono } from "hono";
import { errorHandler } from "../../middleware/error.middleware";
import { sweepAuditLogRoutes } from "../sweep-audit-log.route";
import { sweepOutboxRoutes } from "../sweep-outbox.route";
import { sweepWebhookDeliveryRoutes } from "../sweep-webhook-delivery.route";

function makeApp(routes: Hono) {
  const app = new Hono();
  app.onError(errorHandler);
  app.route("/internal", routes);
  return app;
}

const cases: Array<{ name: string; path: string; routes: Hono }> = [
  {
    name: "sweep-outbox",
    path: "/internal/sweep-outbox",
    routes: sweepOutboxRoutes as unknown as Hono,
  },
  {
    name: "sweep-audit-log",
    path: "/internal/sweep-audit-log",
    routes: sweepAuditLogRoutes as unknown as Hono,
  },
  {
    name: "sweep-webhook-delivery",
    path: "/internal/sweep-webhook-delivery",
    routes: sweepWebhookDeliveryRoutes as unknown as Hono,
  },
];

describe.each(cases)("POST /internal/$name — HMAC gating", ({ path, routes }) => {
  it("rejects with 401 when signature header is missing", async () => {
    const res = await makeApp(routes).request(path, {
      method: "POST",
      headers: { "Content-Type": "application/json", host: "localhost" },
      body: JSON.stringify({ dryRun: true }),
    });
    expect(res.status).toBe(401);
  });

  it("rejects with 401 when signature header is malformed", async () => {
    const res = await makeApp(routes).request(path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        host: "localhost",
        "x-internal-sig": "garbage",
      },
      body: JSON.stringify({ dryRun: true }),
    });
    expect(res.status).toBe(401);
  });
});
