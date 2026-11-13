import { beforeEach, describe, expect, it } from "bun:test";
import { type ILogger, Option, Result } from "@packages/ddd-kit";
import { createErrorHandler } from "@packages/http/error-handler";
import type { RouteGuard } from "@packages/http/route-guards";
import { openRouteGuards } from "@packages/http/testing/route-guards";
import { mockPort } from "@packages/test/bun";
import { mockInstrumentation } from "@packages/test/bun/instrumentation";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import {
  type ConsentRoutesDeps,
  createConsentRoutes,
} from "../../../infra/http/routes/consents/consents";

const recordConsent = mockPort<ConsentRoutesDeps["RecordConsentUseCase"]>();
const withdrawConsent = mockPort<ConsentRoutesDeps["WithdrawConsentUseCase"]>();
const activeConsent = mockPort<ConsentRoutesDeps["IGetActiveConsentQuery"]>();

const refuseImpersonation: RouteGuard = async () => {
  throw new HTTPException(403, { message: "impersonating" });
};

interface Call {
  method: "GET" | "POST" | "DELETE";
  guards?: ConsentRoutesDeps["routeGuards"];
  headers?: Record<string, string>;
}

function send({ method, guards = openRouteGuards(), headers = {} }: Call) {
  const app = new Hono().route(
    "/consents",
    createConsentRoutes({
      routeGuards: guards,
      consentSettings: { secureCookie: false },
      RecordConsentUseCase: recordConsent,
      WithdrawConsentUseCase: withdrawConsent,
      IGetActiveConsentQuery: activeConsent,
    }),
  );
  app.onError(
    createErrorHandler({
      instrumentation: mockInstrumentation(),
      logger: mockPort<ILogger>(),
      isProduction: false,
    }),
  );

  return app.request("/consents", {
    method,
    headers: { "content-type": "application/json", ...headers },
    body: method === "POST" ? JSON.stringify({ categories: [] }) : undefined,
  });
}

const SUBJECT = "0b9f3c2e-4a1d-4c8e-9f6a-2d7b1e5c8a90";
const BROWSER = { cookie: `cc_sid=${SUBJECT}` };

beforeEach(() => {
  recordConsent.execute.mockReset();
  recordConsent.execute.mockImplementation(async (input) =>
    Result.ok({
      subjectId: input.subjectId.unwrapOr("minted-subject"),
      categories: ["necessary"],
      policyVersion: "v1",
    }),
  );
  withdrawConsent.execute.mockReset();
  withdrawConsent.execute.mockResolvedValue(Result.ok());
  activeConsent.execute.mockReset();
  activeConsent.execute.mockResolvedValue(Result.ok(Option.none()));
});

describe("consent writes under impersonation", () => {
  const impersonating = {
    ...openRouteGuards({ userId: "user-1" }),
    denyImpersonated: refuseImpersonation,
  };

  it("refuses recording a consent for the impersonated user", async () => {
    const res = await send({ method: "POST", guards: impersonating, headers: BROWSER });

    expect(res.status).toBe(403);
    expect(recordConsent.execute).not.toHaveBeenCalled();
  });

  it("refuses withdrawing a consent for the impersonated user", async () => {
    const res = await send({ method: "DELETE", guards: impersonating, headers: BROWSER });

    expect(res.status).toBe(403);
    expect(withdrawConsent.execute).not.toHaveBeenCalled();
  });

  it("still lets an anonymous visitor record a consent", async () => {
    const res = await send({ method: "POST", headers: BROWSER });

    expect(res.status).toBe(200);
    expect(recordConsent.execute).toHaveBeenCalledWith(
      expect.objectContaining({ userId: Option.none() }),
    );
  });
});

describe("the consent subject cookie", () => {
  it("hands the minted subject to a browser that had none", async () => {
    const res = await send({ method: "POST", headers: { "user-agent": "probe/1" } });

    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toStartWith("cc_sid=minted-subject;");
    expect(recordConsent.execute).toHaveBeenCalledWith(
      expect.objectContaining({ subjectId: Option.none(), userAgent: Option.some("probe/1") }),
    );
  });

  it("keeps the subject a browser already carries", async () => {
    const res = await send({ method: "POST", headers: BROWSER });

    expect(res.headers.get("set-cookie")).toBeNull();
    expect(recordConsent.execute).toHaveBeenCalledWith(
      expect.objectContaining({ subjectId: Option.some(SUBJECT) }),
    );
  });

  it("answers no consent and withdraws nothing for a browser without a subject", async () => {
    const read = await send({ method: "GET" });
    const withdrawn = await send({ method: "DELETE" });

    expect(await read.json()).toEqual({ categories: null, policyVersion: null });
    expect(await withdrawn.json()).toEqual({ withdrawn: false });
    expect(activeConsent.execute).not.toHaveBeenCalled();
    expect(withdrawConsent.execute).not.toHaveBeenCalled();
  });

  it("treats a malformed or oversized subject as absent", async () => {
    const malformed = await send({ method: "POST", headers: { cookie: "cc_sid=not-a-subject" } });
    const oversized = await send({
      method: "POST",
      headers: { cookie: `cc_sid=${SUBJECT}${"a".repeat(4000)}` },
    });
    const read = await send({ method: "GET", headers: { cookie: "cc_sid=not-a-subject" } });
    const withdrawn = await send({ method: "DELETE", headers: { cookie: "cc_sid=not-a-subject" } });

    expect([malformed.status, oversized.status]).toEqual([200, 200]);
    expect(malformed.headers.get("set-cookie")).toStartWith("cc_sid=minted-subject;");
    expect(oversized.headers.get("set-cookie")).toStartWith("cc_sid=minted-subject;");
    expect(recordConsent.execute.mock.calls.map(([input]) => input.subjectId)).toEqual([
      Option.none(),
      Option.none(),
    ]);
    expect(await read.json()).toEqual({ categories: null, policyVersion: null });
    expect(await withdrawn.json()).toEqual({ withdrawn: false });
    expect(activeConsent.execute).not.toHaveBeenCalled();
    expect(withdrawConsent.execute).not.toHaveBeenCalled();
  });

  it("hands no subject to the browser when the consent cannot be recorded", async () => {
    recordConsent.execute.mockResolvedValue(
      Result.fail({ code: "CONSENT_PROVIDER_FAILURE", message: "db error" }),
    );

    const res = await send({ method: "POST" });

    expect(res.status).toBe(502);
    expect(res.headers.get("set-cookie")).toBeNull();
  });
});

describe("the user agent of a consent", () => {
  it("keeps at most 512 characters of it", async () => {
    await send({ method: "POST", headers: { ...BROWSER, "user-agent": "u".repeat(9000) } });

    expect(recordConsent.execute).toHaveBeenCalledWith(
      expect.objectContaining({ userAgent: Option.some("u".repeat(512)) }),
    );
  });
});
