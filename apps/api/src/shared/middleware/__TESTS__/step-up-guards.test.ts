import { describe, expect, it } from "bun:test";
import { type AppError, Option, Result } from "@packages/ddd-kit";
import { Hono } from "hono";
import { NoOpInstrumentation } from "../../services/noop-instrumentation";
import { createErrorHandler } from "../error.middleware";
import { stepUpGuards } from "../step-up-guards";

type Decision = Result<Option<Date>, AppError<"ADMIN_STEP_UP_PROVIDER_FAILURE">>;

const CONFIRMED: Decision = Result.ok(Option.some(new Date()));
const NOT_CONFIRMED: Decision = Result.ok(Option.none<Date>());

function appFor(given: {
  twoFactorEnabled?: boolean;
  impersonatedBy?: string;
  decision?: Decision;
}) {
  const { requireStepUp } = stepUpGuards(() => ({
    validUntil: async () => given.decision ?? CONFIRMED,
  }));
  const app = new Hono<{
    Variables: {
      requestId: string;
      user: { twoFactorEnabled?: boolean };
      session: { id: string; impersonatedBy?: string };
    };
  }>()
    .use("*", async (c, next) => {
      c.set("requestId", "req");
      c.set("user", { twoFactorEnabled: given.twoFactorEnabled ?? true });
      c.set("session", { id: "s1", impersonatedBy: given.impersonatedBy });
      await next();
    })
    .post("/sensitive", requireStepUp, (c) => c.json({ ok: true }));
  app.onError(createErrorHandler(new NoOpInstrumentation()));

  return app;
}

async function refusal(res: Response) {
  const body: unknown = await res.json();

  return { status: res.status, body };
}

describe("requireStepUp", () => {
  it("lets a confirmed session through", async () => {
    const res = await appFor({}).request("/sensitive", { method: "POST" });

    expect(res.status).toBe(200);
  });

  it("answers 403 ADMIN_REAUTH_REQUIRED without a live confirmation", async () => {
    const res = await appFor({ decision: NOT_CONFIRMED }).request("/sensitive", { method: "POST" });

    expect(await refusal(res)).toMatchObject({
      status: 403,
      body: { error: { code: "ADMIN_REAUTH_REQUIRED" } },
    });
  });

  it("fails closed without two-factor, even over a stored confirmation", async () => {
    const res = await appFor({ twoFactorEnabled: false }).request("/sensitive", { method: "POST" });

    expect(await refusal(res)).toMatchObject({
      status: 403,
      body: { error: { code: "ADMIN_STAFF_MFA_FORBIDDEN" } },
    });
  });

  it("fails closed under impersonation, even over a stored confirmation", async () => {
    const res = await appFor({ impersonatedBy: "admin" }).request("/sensitive", { method: "POST" });

    expect(await refusal(res)).toMatchObject({
      status: 403,
      body: { error: { code: "IMPERSONATION_ACTION_FORBIDDEN" } },
    });
  });
});
