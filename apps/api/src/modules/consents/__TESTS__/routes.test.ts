import { beforeEach, describe, expect, it } from "bun:test";
import { Option, Result } from "@packages/ddd-kit";
import type { RouteGuard } from "@packages/http/route-guards";
import { openRouteGuards } from "@packages/http/testing/route-guards";
import { mockPort } from "@packages/test/bun";
import { mockInstrumentation } from "@packages/test/bun/instrumentation";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { createErrorHandler } from "../../../shared/middleware/error.middleware";
import type { ConsentRecordRow } from "../application/ports/consent.port";
import { type ConsentRoutesDeps, createConsentRoutes } from "../routes";

const recorded: ConsentRecordRow = {
  id: "consent-1",
  subjectId: "subject-1",
  userId: Option.none(),
  categories: [],
  policyVersion: "v1",
  grantedAt: new Date("2026-01-01"),
  withdrawnAt: Option.none(),
  expiresAt: new Date("2027-01-01"),
  ipAddress: Option.none(),
  userAgent: Option.none(),
};

const consents = mockPort<ConsentRoutesDeps["ConsentService"]>();

const refuseImpersonation: RouteGuard = async () => {
  throw new HTTPException(403, { message: "impersonating" });
};

function send(method: "POST" | "DELETE", guards = openRouteGuards()) {
  const app = new Hono().route(
    "/consents",
    createConsentRoutes({
      routeGuards: guards,
      consentSettings: { secureCookie: false },
      ConsentService: consents,
    }),
  );
  app.onError(createErrorHandler(mockInstrumentation()));

  return app.request("/consents", {
    method,
    headers: { "content-type": "application/json", cookie: "cc_sid=subject-1" },
    body: method === "POST" ? JSON.stringify({ categories: [] }) : undefined,
  });
}

describe("consent writes under impersonation", () => {
  const impersonating = {
    ...openRouteGuards({ userId: "user-1" }),
    denyImpersonated: refuseImpersonation,
  };

  beforeEach(() => {
    consents.record.mockReset();
    consents.record.mockResolvedValue(Result.ok(recorded));
    consents.withdraw.mockReset();
    consents.withdraw.mockResolvedValue(Result.ok());
  });

  it("refuses recording a consent for the impersonated user", async () => {
    const res = await send("POST", impersonating);

    expect(res.status).toBe(403);
    expect(consents.record).not.toHaveBeenCalled();
  });

  it("refuses withdrawing a consent for the impersonated user", async () => {
    const res = await send("DELETE", impersonating);

    expect(res.status).toBe(403);
    expect(consents.withdraw).not.toHaveBeenCalled();
  });

  it("still lets an anonymous visitor record a consent", async () => {
    const res = await send("POST");

    expect(res.status).toBe(200);
    expect(consents.record).toHaveBeenCalledWith(expect.objectContaining({ userId: undefined }));
  });
});
