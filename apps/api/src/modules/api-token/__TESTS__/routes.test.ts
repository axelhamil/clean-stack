import { describe, expect, it, mock } from "bun:test";
import { Result } from "@packages/ddd-kit";
import type { ApiTokenError, ApiTokenRecord } from "../application/ports/api-token.port";

const RECORD: ApiTokenRecord = {
  id: "tok-1",
  userId: "user-1",
  organizationId: null,
  name: "ci",
  scopes: ["read:profile"],
  tokenHmac: "hmac-secret-must-not-leak",
  pepperVersion: 1,
  tokenStart: "clean_tok.....",
  lastUsedAt: null,
  expiresAt: null,
  revokedAt: null,
  revokedReason: null,
  createdAt: new Date("2024-01-01"),
};

const RAW = "clean_raw_token_value_never_persisted";

const mockCreate = mock(async () =>
  Result.ok<{ record: ApiTokenRecord; raw: string }, ApiTokenError>({ record: RECORD, raw: RAW }),
);
const mockList = mock(async () => Result.ok<ApiTokenRecord[], ApiTokenError>([RECORD]));
const mockRevoke = mock(async (): Promise<Result<void, ApiTokenError>> => Result.ok());

mock.module("../../../container", () => ({
  di: {
    ApiTokenService: { create: mockCreate, list: mockList, revoke: mockRevoke },
    PolicyAcceptanceService: {
      hasAcceptedCurrent: mock(async () => Result.ok(true)),
    },
  },
}));

let currentSession: Record<string, unknown> = { activeOrganizationId: null };

mock.module("../../../shared/middleware/auth.middleware", () => ({
  // biome-ignore lint/suspicious/noExplicitAny: test stub
  requireAuth: async (c: any, next: () => Promise<void>) => {
    c.set("user", { id: "user-1" });
    c.set("session", currentSession);
    await next();
  },
  AuthVariables: {},
}));

mock.module("../../../shared/middleware/org.middleware", () => ({
  // biome-ignore lint/suspicious/noExplicitAny: test stub
  requireOrg: async (c: any, next: () => Promise<void>) => {
    c.set("orgId", c.get("session")?.activeOrganizationId ?? null);
    await next();
  },
  requireOrgPermission: () => async (_c: unknown, next: () => Promise<void>) => {
    await next();
  },
}));

const { apiTokenRoutes } = await import("../routes");
const { Hono } = await import("hono");
const { createErrorHandler } = await import("../../../shared/middleware/error.middleware");
const { NoOpInstrumentation } = await import("../../../shared/services/noop-instrumentation");

function makeApp() {
  const app = new Hono<{ Variables: { requestId: string } }>();
  app.use("*", async (c, next) => {
    c.set("requestId", "req-test");
    await next();
  });
  app.onError(createErrorHandler(new NoOpInstrumentation()));
  app.route("/settings/tokens", apiTokenRoutes);
  return app;
}

describe("POST /settings/tokens — create", () => {
  it("returns 201 with raw token and safe record (no tokenHmac, no pepperVersion)", async () => {
    currentSession = { activeOrganizationId: null };
    const app = makeApp();
    const res = await app.request("/settings/tokens", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "ci",
        scopes: ["read:profile"],
        organizationId: null,
        expiresInDays: null,
      }),
    });
    expect(res.status).toBe(201);
    // biome-ignore lint/suspicious/noExplicitAny: test assertion
    const body = (await res.json()) as any;
    expect(body.token).toBe(RAW);
    expect(body.record.id).toBe("tok-1");
    expect(body.record.tokenHmac).toBeUndefined();
    expect(body.record.pepperVersion).toBeUndefined();
  });

  it("returns 403 when the session is impersonated", async () => {
    currentSession = { activeOrganizationId: null, impersonatedBy: "admin-99" };
    mockCreate.mockClear();
    const app = makeApp();
    const res = await app.request("/settings/tokens", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "ci",
        scopes: ["read:profile"],
        organizationId: null,
        expiresInDays: null,
      }),
    });
    expect(res.status).toBe(403);
    expect(mockCreate).not.toHaveBeenCalled();
  });
});

describe("GET /settings/tokens — list", () => {
  it("never exposes tokenHmac or the raw token value", async () => {
    currentSession = { activeOrganizationId: null };
    const app = makeApp();
    const res = await app.request("/settings/tokens", { method: "GET" });
    expect(res.status).toBe(200);
    // biome-ignore lint/suspicious/noExplicitAny: test assertion
    const body = (await res.json()) as any;
    expect(Array.isArray(body.items)).toBe(true);
    const item = body.items[0];
    expect(item.tokenHmac).toBeUndefined();
    expect(item.pepperVersion).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain(RECORD.tokenHmac);
    expect(JSON.stringify(body)).not.toContain(RAW);
  });
});

describe("DELETE /settings/tokens/:id — wrong owner returns 404", () => {
  it("returns 404 when the service reports API_TOKEN_NOT_FOUND", async () => {
    currentSession = { activeOrganizationId: null };
    mockRevoke.mockImplementationOnce(async () =>
      Result.fail({ code: "API_TOKEN_NOT_FOUND", message: "Token not found." }),
    );
    const app = makeApp();
    const res = await app.request("/settings/tokens/tok-other", { method: "DELETE" });
    expect(res.status).toBe(404);
  });
});
