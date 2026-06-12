import { describe, expect, it, mock } from "bun:test";
import { Result } from "@packages/ddd-kit";
import { Hono } from "hono";

let mockedAddress = "1.2.3.4";

mock.module("hono/bun", () => ({
  getConnInfo: () => ({ remote: { address: mockedAddress } }),
}));

const { requireRateLimit } = await import("../middleware/rate-limit.middleware");
const { resolveClientIp, GLOBAL_POLICY, AUTH_SIGN_IN_POLICY, AUTH_MAGIC_LINK_POLICY } =
  await import("../middleware/rate-limit.policies");
const { createErrorHandler } = await import("../middleware/error.middleware");

import type { IInstrumentation } from "../ports/instrumentation.port";
import type { IRateLimiter, RateLimitDecision, RateLimitError } from "../ports/rate-limiter.port";

function makeNoop(): IInstrumentation {
  return {
    startSpan: (_o, cb) => cb() as ReturnType<typeof cb>,
    capture: () => {},
    addBreadcrumb: () => {},
  };
}

function allowDecision(policyName = "global"): RateLimitDecision {
  return { allowed: true, limit: 60, remaining: 59, resetSeconds: 60, policyName };
}

function blockDecision(policyName = "global"): RateLimitDecision {
  return { allowed: false, limit: 60, remaining: 0, resetSeconds: 45, policyName };
}

function makeLimiter(decision: RateLimitDecision): IRateLimiter {
  return {
    consume: async () => Result.ok(decision),
  };
}

function makeFailLimiter(): IRateLimiter {
  return {
    consume: async () =>
      Result.fail<RateLimitDecision, RateLimitError>({
        code: "RATE_LIMITER_INTERNAL_ERROR",
        message: "store down",
      }),
  };
}

function makeApp(limiter: IRateLimiter) {
  const app = new Hono<{ Variables: { requestId: string; user: null } }>();
  app.use("*", async (c, next) => {
    c.set("requestId", "req-123");
    c.set("user", null);
    await next();
  });
  app.use("*", requireRateLimit(limiter, GLOBAL_POLICY));
  app.get("/ok", (c) => c.json({ ok: true }));
  app.onError(createErrorHandler(makeNoop()));
  return app;
}

describe("requireRateLimit middleware", () => {
  describe("allowed request", () => {
    it("passes through and sets RateLimit headers", async () => {
      const app = makeApp(makeLimiter(allowDecision()));
      const res = await app.request("/ok");
      expect(res.status).toBe(200);
      expect(res.headers.get("RateLimit-Policy")).toBeTruthy();
      expect(res.headers.get("RateLimit")).toBeTruthy();
    });

    it("RateLimit header contains remaining and t values", async () => {
      const app = makeApp(makeLimiter(allowDecision()));
      const res = await app.request("/ok");
      const rl = res.headers.get("RateLimit") ?? "";
      expect(rl).toContain("r=59");
      expect(rl).toContain("t=60");
    });

    it("RateLimit-Policy header contains q and w values", async () => {
      const app = makeApp(makeLimiter(allowDecision()));
      const res = await app.request("/ok");
      const rlp = res.headers.get("RateLimit-Policy") ?? "";
      expect(rlp).toContain("q=60");
      expect(rlp).toContain("w=60");
    });
  });

  describe("blocked request", () => {
    it("returns 429 with SECURITY_RATE_LIMITED code", async () => {
      const app = makeApp(makeLimiter(blockDecision()));
      const res = await app.request("/ok");
      expect(res.status).toBe(429);
      const body = await res.json();
      expect(body).toMatchObject({ error: { code: "SECURITY_RATE_LIMITED" } });
    });

    it("sets Retry-After header", async () => {
      const app = makeApp(makeLimiter(blockDecision()));
      const res = await app.request("/ok");
      expect(res.headers.get("Retry-After")).toBe("45");
    });

    it("sets RateLimit headers even when blocked", async () => {
      const app = makeApp(makeLimiter(blockDecision()));
      const res = await app.request("/ok");
      expect(res.headers.get("RateLimit-Policy")).toBeTruthy();
      expect(res.headers.get("RateLimit")).toBeTruthy();
    });
  });

  describe("fail-open on limiter error", () => {
    it("allows request through when limiter fails internally", async () => {
      const app = makeApp(makeFailLimiter());
      const res = await app.request("/ok");
      expect(res.status).toBe(200);
    });
  });

  describe("key function", () => {
    it("uses userId when user is in context", async () => {
      let capturedKey: string | undefined;
      const limiter: IRateLimiter = {
        consume: async (key) => {
          capturedKey = key;
          return Result.ok(allowDecision());
        },
      };
      const app = new Hono<{ Variables: { requestId: string; user: { id: string } | null } }>();
      app.use("*", async (c, next) => {
        c.set("requestId", "req-user");
        c.set("user", { id: "user-42" });
        await next();
      });
      app.use("*", requireRateLimit(limiter, GLOBAL_POLICY));
      app.get("/ok", (c) => c.json({ ok: true }));
      app.onError(createErrorHandler(makeNoop()));

      await app.request("/ok");
      expect(capturedKey).toBe("global:user-42");
    });

    it("uses IP when no user in context", async () => {
      mockedAddress = "10.0.0.1";
      let capturedKey: string | undefined;
      const limiter: IRateLimiter = {
        consume: async (key) => {
          capturedKey = key;
          return Result.ok(allowDecision());
        },
      };
      const app = makeApp(limiter);
      await app.request("/ok");
      expect(capturedKey).toBe("global:10.0.0.1");
    });
  });

  describe("policy isolation — sign-in vs magic-link", () => {
    it("a magic-link request consumes ONLY the magic-link policy, not sign-in", async () => {
      const consumedPolicies: string[] = [];
      const limiter: IRateLimiter = {
        consume: async (key) => {
          consumedPolicies.push(key);
          return Result.ok(allowDecision());
        },
      };
      const app = new Hono<{ Variables: { requestId: string; user: null } }>();
      app.use("*", async (c, next) => {
        c.set("requestId", "req-magic");
        c.set("user", null);
        await next();
      });
      app.use("/api/auth/sign-in/email", requireRateLimit(limiter, AUTH_SIGN_IN_POLICY));
      app.use("/api/auth/sign-in/magic-link", requireRateLimit(limiter, AUTH_MAGIC_LINK_POLICY));
      app.post("/api/auth/sign-in/magic-link", (c) => c.json({ ok: true }));
      app.onError(createErrorHandler(makeNoop()));

      mockedAddress = "1.2.3.4";
      await app.request("/api/auth/sign-in/magic-link", { method: "POST" });

      const signInKeys = consumedPolicies.filter((k) => k.startsWith("auth-sign-in:"));
      const magicLinkKeys = consumedPolicies.filter((k) => k.startsWith("auth-magic-link:"));
      expect(signInKeys).toHaveLength(0);
      expect(magicLinkKeys).toHaveLength(1);
    });

    it("a sign-in/email request consumes ONLY the sign-in policy, not magic-link", async () => {
      const consumedPolicies: string[] = [];
      const limiter: IRateLimiter = {
        consume: async (key) => {
          consumedPolicies.push(key);
          return Result.ok(allowDecision());
        },
      };
      const app = new Hono<{ Variables: { requestId: string; user: null } }>();
      app.use("*", async (c, next) => {
        c.set("requestId", "req-signin");
        c.set("user", null);
        await next();
      });
      app.use("/api/auth/sign-in/email", requireRateLimit(limiter, AUTH_SIGN_IN_POLICY));
      app.use("/api/auth/sign-in/magic-link", requireRateLimit(limiter, AUTH_MAGIC_LINK_POLICY));
      app.post("/api/auth/sign-in/email", (c) => c.json({ ok: true }));
      app.onError(createErrorHandler(makeNoop()));

      mockedAddress = "1.2.3.4";
      await app.request("/api/auth/sign-in/email", { method: "POST" });

      const signInKeys = consumedPolicies.filter((k) => k.startsWith("auth-sign-in:"));
      const magicLinkKeys = consumedPolicies.filter((k) => k.startsWith("auth-magic-link:"));
      expect(signInKeys).toHaveLength(1);
      expect(magicLinkKeys).toHaveLength(0);
    });
  });

  describe("resolveClientIp", () => {
    it("returns socket address when TRUSTED_PROXIES is not set", async () => {
      mockedAddress = "5.6.7.8";
      const app = new Hono();
      app.get("/ip", (c) => c.json({ ip: resolveClientIp(c) }));
      const res = await app.request("/ip");
      const body = (await res.json()) as { ip: string };
      expect(body.ip).toBe("5.6.7.8");
    });

    it("single trusted proxy: XFF with one entry returns the client IP", async () => {
      mockedAddress = "10.0.0.1";
      const { env: e } = await import("../env");
      (e as Record<string, unknown>).TRUSTED_PROXIES = ["10.0.0.1"];

      const app = new Hono();
      app.get("/ip", (c) => c.json({ ip: resolveClientIp(c) }));
      const res = await app.request("/ip", {
        headers: { "x-forwarded-for": "203.0.113.1" },
      });
      const body = (await res.json()) as { ip: string };
      expect(body.ip).toBe("203.0.113.1");

      (e as Record<string, unknown>).TRUSTED_PROXIES = undefined;
    });

    it("two trusted proxies: XFF skips all trusted entries, returns first non-trusted from right", async () => {
      mockedAddress = "127.0.0.1";
      const { env: e } = await import("../env");
      (e as Record<string, unknown>).TRUSTED_PROXIES = ["127.0.0.1", "10.0.0.1"];

      const app = new Hono();
      app.get("/ip", (c) => c.json({ ip: resolveClientIp(c) }));
      const res = await app.request("/ip", {
        headers: { "x-forwarded-for": "203.0.113.1, 10.0.0.1" },
      });
      const body = (await res.json()) as { ip: string };
      expect(body.ip).toBe("203.0.113.1");

      (e as Record<string, unknown>).TRUSTED_PROXIES = undefined;
    });

    it("spoofed XFF prefix: only rightmost non-trusted entry matters", async () => {
      mockedAddress = "10.0.0.1";
      const { env: e } = await import("../env");
      (e as Record<string, unknown>).TRUSTED_PROXIES = ["10.0.0.1"];

      const app = new Hono();
      app.get("/ip", (c) => c.json({ ip: resolveClientIp(c) }));
      const res = await app.request("/ip", {
        headers: { "x-forwarded-for": "1.2.3.4, 203.0.113.1" },
      });
      const body = (await res.json()) as { ip: string };
      expect(body.ip).toBe("203.0.113.1");

      (e as Record<string, unknown>).TRUSTED_PROXIES = undefined;
    });

    it("all-trusted XFF: falls back to socket address", async () => {
      mockedAddress = "127.0.0.1";
      const { env: e } = await import("../env");
      (e as Record<string, unknown>).TRUSTED_PROXIES = ["127.0.0.1", "10.0.0.1"];

      const app = new Hono();
      app.get("/ip", (c) => c.json({ ip: resolveClientIp(c) }));
      const res = await app.request("/ip", {
        headers: { "x-forwarded-for": "10.0.0.1" },
      });
      const body = (await res.json()) as { ip: string };
      expect(body.ip).toBe("127.0.0.1");

      (e as Record<string, unknown>).TRUSTED_PROXIES = undefined;
    });

    it("no XFF header with trusted socket: falls back to socket address", async () => {
      mockedAddress = "10.0.0.1";
      const { env: e } = await import("../env");
      (e as Record<string, unknown>).TRUSTED_PROXIES = ["10.0.0.1"];

      const app = new Hono();
      app.get("/ip", (c) => c.json({ ip: resolveClientIp(c) }));
      const res = await app.request("/ip");
      const body = (await res.json()) as { ip: string };
      expect(body.ip).toBe("10.0.0.1");

      (e as Record<string, unknown>).TRUSTED_PROXIES = undefined;
    });
  });

  describe("auth-specific policy key uses IP", () => {
    it("AUTH_SIGN_IN_POLICY key includes IP not userId", async () => {
      mockedAddress = "9.9.9.9";
      let capturedKey: string | undefined;
      const limiter: IRateLimiter = {
        consume: async (key) => {
          capturedKey = key;
          return Result.ok(allowDecision("auth-sign-in"));
        },
      };
      const app = new Hono<{ Variables: { requestId: string; user: { id: string } | null } }>();
      app.use("*", async (c, next) => {
        c.set("requestId", "req-auth");
        c.set("user", { id: "user-99" });
        await next();
      });
      app.use("*", requireRateLimit(limiter, AUTH_SIGN_IN_POLICY));
      app.post("/api/auth/sign-in/email", (c) => c.json({ ok: true }));
      app.onError(createErrorHandler(makeNoop()));

      await app.request("/api/auth/sign-in/email", { method: "POST" });
      expect(capturedKey).toBe("auth-sign-in:9.9.9.9");
    });
  });
});
