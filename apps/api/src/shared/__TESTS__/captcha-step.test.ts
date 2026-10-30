import { beforeEach, describe, expect, it, mock } from "bun:test";
import { Result } from "@packages/ddd-kit";
import { mockPort } from "@packages/test/bun";
import { Hono } from "hono";
import { mockInstrumentation } from "../../__TESTS__/mock-instrumentation";
import type { CaptchaError, ICaptchaService } from "../ports/captcha.port";

let clientAddress = "1.2.3.4";

const realHonoBun = await import("hono/bun");
mock.module("hono/bun", () => ({
  ...realHonoBun,
  getConnInfo: () => ({ remote: { address: clientAddress } }),
}));

const { requireRateLimit } = await import("../middleware/rate-limit.middleware");
const { AUTH_SIGN_IN_POLICY, AUTH_SIGN_UP_POLICY, GLOBAL_POLICY } = await import(
  "../middleware/rate-limit.policies"
);
const { createErrorHandler } = await import("../middleware/error.middleware");
const { memoryFactory, RateLimiterFlexibleAdapter } = await import(
  "../services/rate-limiter-flexible.adapter"
);
const { NoopCaptchaService } = await import("../services/noop-captcha.service");

function enabledCaptcha(): ReturnType<typeof mockPort<ICaptchaService>> {
  const captcha = mockPort<ICaptchaService>();
  captcha.verify.mockResolvedValue(Result.ok(true));

  return captcha;
}

function makeApp(captcha: ICaptchaService, policy = AUTH_SIGN_IN_POLICY) {
  const limiter = new RateLimiterFlexibleAdapter(mockInstrumentation(), memoryFactory);
  const app = new Hono<{ Variables: { requestId: string; user: null } }>();
  app.use(
    "*",
    requireRateLimit({ limiter, captcha: { service: captcha, usage: limiter } }, policy),
  );
  app.post("/guarded", (c) => c.json({ ok: true }));
  app.onError(createErrorHandler(mockInstrumentation()));

  return app;
}

const post = (app: ReturnType<typeof makeApp>, token?: string) =>
  app.request("/guarded", {
    method: "POST",
    headers: token ? { "X-Captcha-Token": token } : {},
  });

async function exhaustFreeAttempts(app: ReturnType<typeof makeApp>, attempts = 4) {
  for (let attempt = 0; attempt < attempts; attempt++) {
    expect((await post(app)).status).toBe(200);
  }
}

describe("requireRateLimit captcha step", () => {
  beforeEach(() => {
    clientAddress = `10.1.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;
  });

  it("given the flag is off, when the window fills, then no captcha is asked and the limit answers", async () => {
    const app = makeApp(new NoopCaptchaService());

    await exhaustFreeAttempts(app, 5);

    expect((await post(app)).status).toBe(429);
  });

  it("given a policy that did not opt in, when it nears its cap, then no captcha is asked", async () => {
    const captcha = enabledCaptcha();
    const app = makeApp(captcha, {
      ...GLOBAL_POLICY,
      windows: [{ policyName: "no-captcha", windowSec: 60, maxRequests: 2 }],
    });

    await exhaustFreeAttempts(app, 2);

    expect(captcha.verify).not.toHaveBeenCalled();
  });

  it("given usage below 80 %, when a request has no token, then it proceeds without calling the provider", async () => {
    const captcha = enabledCaptcha();
    const app = makeApp(captcha);

    await exhaustFreeAttempts(app);

    expect(captcha.verify).not.toHaveBeenCalled();
  });

  it("given usage above 80 %, when a request has no token, then it gets CAPTCHA_REQUIRED and keeps its budget", async () => {
    const captcha = enabledCaptcha();
    const app = makeApp(captcha);
    await exhaustFreeAttempts(app);

    const first = await post(app);
    const second = await post(app);
    const withToken = await post(app, "valid-token");

    expect(first.status).toBe(401);
    expect(await first.json()).toMatchObject({ error: { code: "CAPTCHA_REQUIRED" } });
    expect(second.status).toBe(401);
    expect(withToken.status).toBe(200);
    expect(captcha.verify).toHaveBeenCalledTimes(1);
  });

  it("given usage above 80 %, when the token is valid, then the request proceeds and the limit still ends the window", async () => {
    const captcha = enabledCaptcha();
    const app = makeApp(captcha);
    await exhaustFreeAttempts(app);

    expect((await post(app, "valid-token")).status).toBe(200);
    expect(captcha.verify.mock.calls[0]).toEqual(["valid-token", clientAddress]);
    expect((await post(app, "valid-token")).status).toBe(429);
  });

  it("given usage above 80 %, when the token is refused, then it gets CAPTCHA_REQUIRED and pays for the provider call", async () => {
    const captcha = enabledCaptcha();
    captcha.verify.mockResolvedValue(Result.ok(false));
    const app = makeApp(captcha);
    await exhaustFreeAttempts(app);

    const refused = await post(app, "forged-token");
    const next = await post(app, "forged-token");

    expect(await refused.json()).toMatchObject({ error: { code: "CAPTCHA_REQUIRED" } });
    expect(next.status).toBe(429);
    expect(captcha.verify).toHaveBeenCalledTimes(1);
  });

  it("given the provider is down, when a token is sent, then the request fails open", async () => {
    const captcha = enabledCaptcha();
    captcha.verify.mockResolvedValue(
      Result.fail<boolean, CaptchaError>({
        code: "CAPTCHA_PROVIDER_FAILURE",
        message: "HTTP 503",
      }),
    );
    const app = makeApp(captcha);
    await exhaustFreeAttempts(app);

    expect((await post(app, "any-token")).status).toBe(200);
  });

  it("given the sign-up policy, when it passes 80 %, then the captcha is asked", async () => {
    const app = makeApp(enabledCaptcha(), AUTH_SIGN_UP_POLICY);
    await exhaustFreeAttempts(app, 8);

    const res = await post(app);

    expect(await res.json()).toMatchObject({ error: { code: "CAPTCHA_REQUIRED" } });
  });
});
