import { describe, expect, it } from "bun:test";
import { Hono } from "hono";
import { createErrorHandler } from "../../middleware/error.middleware";
import { NoOpInstrumentation } from "../../services/noop-instrumentation";
import { SIGNATURE_HEADER } from "../internal-signature";
import { sweepAuditLogRoutes } from "../sweep-audit-log.route";
import { sweepConsentsRoutes } from "../sweep-consents.route";
import { sweepNotificationsRoutes } from "../sweep-notifications.route";
import { sweepOutboxRoutes } from "../sweep-outbox.route";
import { sweepStripeEventsRoutes } from "../sweep-stripe-events.route";
import { sweepWebhookDeliveryRoutes } from "../sweep-webhook-delivery.route";

function makeApp(routes: Hono) {
  const app = new Hono();
  app.onError(createErrorHandler(new NoOpInstrumentation()));
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
  {
    name: "sweep-consents",
    path: "/internal/sweep-consents",
    routes: sweepConsentsRoutes as unknown as Hono,
  },
  {
    name: "sweep-stripe-events",
    path: "/internal/sweep-stripe-events",
    routes: sweepStripeEventsRoutes as unknown as Hono,
  },
  {
    name: "sweep-notifications",
    path: "/internal/sweep-notifications",
    routes: sweepNotificationsRoutes as unknown as Hono,
  },
];

describe.each(cases)("POST /internal/$name, HMAC gating", ({ path, routes }) => {
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
        // The real header name: a misspelled one exercised the missing-header path
        // twice and never reached the malformed-value branch.
        [SIGNATURE_HEADER]: "garbage",
      },
      body: JSON.stringify({ dryRun: true }),
    });
    expect(res.status).toBe(401);
  });
});
