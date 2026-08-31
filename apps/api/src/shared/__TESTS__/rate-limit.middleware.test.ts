import { afterEach, describe, expect, it, mock } from "bun:test";
import { Result } from "@packages/ddd-kit";
import { Hono } from "hono";
import type { PolicyConfig } from "../middleware/rate-limit.policies";
import type { IOutboxRepository } from "../ports/outbox.port";

let mockedAddress = "1.2.3.4";

mock.module("hono/bun", () => ({
  getConnInfo: () => ({ remote: { address: mockedAddress } }),
}));

const warnSpy = mock(() => {});
mock.module("../logger", () => ({
  logger: { warn: warnSpy, info: () => {}, error: () => {}, debug: () => {} },
}));

const { requireRateLimit } = await import("../middleware/rate-limit.middleware");
const {
  GLOBAL_POLICY,
  AUTH_SIGN_IN_POLICY,
  AUTH_MAGIC_LINK_POLICY,
  AUTH_TWO_FACTOR_POLICY,
  AUTH_VERIFY_EMAIL_POLICY,
} = await import("../middleware/rate-limit.policies");
const { normalizeHop, resolveClientIp } = await import("../middleware/rate-limit.ip");
const { createErrorHandler } = await import("../middleware/error.middleware");

import type { IInstrumentation } from "../ports/instrumentation.port";
import type { IRateLimiter, RateLimitDecision, RateLimitError } from "../ports/rate-limiter.port";

function makeNoop(): IInstrumentation {
  return {
    startSpan: (_o, cb) => cb() as ReturnType<typeof cb>,
    capture: () => {},
    addBreadcrumb: () => {},
    setSpanAttributes: () => {},
  };
}

function allowDecision(policyName = "global"): RateLimitDecision {
  return {
    allowed: true,
    limit: 60,
    remaining: 59,
    resetSeconds: 60,
    policyName,
    firstBlock: false,
  };
}

function blockDecision(policyName = "global"): RateLimitDecision {
  return {
    allowed: false,
    limit: 60,
    remaining: 0,
    resetSeconds: 45,
    policyName,
    firstBlock: true,
  };
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
  app.use("*", requireRateLimit({ limiter }, GLOBAL_POLICY));
  app.get("/ok", (c) => c.json({ ok: true }));
  app.onError(createErrorHandler(makeNoop()));
  return app;
}

describe("requireRateLimit middleware", () => {
  describe("allowed request", () => {
    it("passes through and sets RateLimit headers with draft-11 format", async () => {
      const app = makeApp(makeLimiter(allowDecision()));
      const res = await app.request("/ok");
      expect(res.status).toBe(200);
      // RFC draft-11: quoted policy name; r=<remaining>;t=<reset>
      expect(res.headers.get("RateLimit")).toMatch(/^"global";r=\d+;t=\d+$/);
      // GLOBAL_POLICY has 2 windows — both must appear in comma-joined RateLimit-Policy
      expect(res.headers.get("RateLimit-Policy")).toMatch(
        /^"global";q=300;w=60, "global";q=1800;w=3600$/,
      );
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
      expect(rlp).toContain("q=300");
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

    it("floors Retry-After to 1 when resetSeconds is 0", async () => {
      const zeroReset: RateLimitDecision = {
        allowed: false,
        limit: 5,
        remaining: 0,
        resetSeconds: 0,
        policyName: "global",
        firstBlock: true,
      };
      const app = makeApp(makeLimiter(zeroReset));
      const res = await app.request("/ok");
      expect(res.headers.get("Retry-After")).toBe("1");
    });

    it("sets RateLimit headers even when blocked", async () => {
      const app = makeApp(makeLimiter(blockDecision()));
      const res = await app.request("/ok");
      expect(res.headers.get("RateLimit-Policy")).toBeTruthy();
      expect(res.headers.get("RateLimit")).toBeTruthy();
    });
  });

  describe("fail-open on limiter error", () => {
    it("allows request through when limiter fails internally and returns route body", async () => {
      const app = makeApp(makeFailLimiter());
      const res = await app.request("/ok");
      expect(res.status).toBe(200);
      const body = (await res.json()) as unknown;
      expect(body).toEqual({ ok: true });
    });
  });

  describe("fail-closed on limiter error (sensitive policies)", () => {
    it("denies with 503 when a failClosed policy's limiter errors", async () => {
      const app = new Hono<{ Variables: { requestId: string; user: null } }>();
      app.use("*", async (c, next) => {
        c.set("requestId", "req-fc");
        c.set("user", null);
        await next();
      });
      app.use("*", requireRateLimit({ limiter: makeFailLimiter() }, AUTH_SIGN_IN_POLICY));
      app.post("/sign-in", (c) => c.json({ ok: true }));
      app.onError(createErrorHandler(makeNoop()));

      const res = await app.request("/sign-in", { method: "POST" });
      expect(res.status).toBe(503);
      const body = (await res.json()) as { error: { code: string } };
      expect(body.error.code).toBe("RATE_LIMITER_UNAVAILABLE");
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
      app.use("*", requireRateLimit({ limiter }, GLOBAL_POLICY));
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
      app.use("/api/auth/sign-in/email", requireRateLimit({ limiter }, AUTH_SIGN_IN_POLICY));
      app.use(
        "/api/auth/sign-in/magic-link",
        requireRateLimit({ limiter }, AUTH_MAGIC_LINK_POLICY),
      );
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
      app.use("/api/auth/sign-in/email", requireRateLimit({ limiter }, AUTH_SIGN_IN_POLICY));
      app.use(
        "/api/auth/sign-in/magic-link",
        requireRateLimit({ limiter }, AUTH_MAGIC_LINK_POLICY),
      );
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

  describe("policy isolation — two-factor vs sign-in", () => {
    it("a two-factor/verify-totp request consumes ONLY the two-factor policy, not sign-in", async () => {
      const consumedPolicies: string[] = [];
      const limiter: IRateLimiter = {
        consume: async (key) => {
          consumedPolicies.push(key);
          return Result.ok(allowDecision());
        },
      };
      const app = new Hono<{ Variables: { requestId: string; user: null } }>();
      app.use("*", async (c, next) => {
        c.set("requestId", "req-2fa");
        c.set("user", null);
        await next();
      });
      app.use("/api/auth/sign-in/email", requireRateLimit({ limiter }, AUTH_SIGN_IN_POLICY));
      app.use(
        "/api/auth/two-factor/verify-totp",
        requireRateLimit({ limiter }, AUTH_TWO_FACTOR_POLICY),
      );
      app.post("/api/auth/two-factor/verify-totp", (c) => c.json({ ok: true }));
      app.onError(createErrorHandler(makeNoop()));

      mockedAddress = "1.2.3.4";
      await app.request("/api/auth/two-factor/verify-totp", { method: "POST" });

      const signInKeys = consumedPolicies.filter((k) => k.startsWith("auth-sign-in:"));
      const twoFactorKeys = consumedPolicies.filter((k) => k.startsWith("auth-two-factor:"));
      expect(signInKeys).toHaveLength(0);
      expect(twoFactorKeys).toHaveLength(1);
    });
  });

  describe("AUTH_VERIFY_EMAIL_POLICY key — token-scoped", () => {
    it("two requests with different tokens consume different keys", async () => {
      const consumedKeys: string[] = [];
      const limiter: IRateLimiter = {
        consume: async (key) => {
          consumedKeys.push(key);
          return Result.ok(allowDecision("auth-verify-email"));
        },
      };
      const app = new Hono<{ Variables: { requestId: string; user: null } }>();
      app.use("*", async (c, next) => {
        c.set("requestId", "req-ve");
        c.set("user", null);
        await next();
      });
      app.use("/api/auth/verify-email", requireRateLimit({ limiter }, AUTH_VERIFY_EMAIL_POLICY));
      app.get("/api/auth/verify-email", (c) => c.json({ ok: true }));
      app.onError(createErrorHandler(makeNoop()));

      mockedAddress = "1.2.3.4";
      await app.request("/api/auth/verify-email?token=abc");
      await app.request("/api/auth/verify-email?token=xyz");

      expect(consumedKeys[0]).toBe("auth-verify-email:abc");
      expect(consumedKeys[1]).toBe("auth-verify-email:xyz");
      expect(consumedKeys[0]).not.toBe(consumedKeys[1]);
    });

    it("missing token falls back to IP", async () => {
      let capturedKey: string | undefined;
      const limiter: IRateLimiter = {
        consume: async (key) => {
          capturedKey = key;
          return Result.ok(allowDecision("auth-verify-email"));
        },
      };
      const app = new Hono<{ Variables: { requestId: string; user: null } }>();
      app.use("*", async (c, next) => {
        c.set("requestId", "req-ve-notoken");
        c.set("user", null);
        await next();
      });
      app.use("/api/auth/verify-email", requireRateLimit({ limiter }, AUTH_VERIFY_EMAIL_POLICY));
      app.get("/api/auth/verify-email", (c) => c.json({ ok: true }));
      app.onError(createErrorHandler(makeNoop()));

      mockedAddress = "5.6.7.8";
      await app.request("/api/auth/verify-email");

      expect(capturedKey).toBe("auth-verify-email:5.6.7.8");
    });
  });

  describe("normalizeHop", () => {
    it("strips :port from IPv4 address", () => {
      expect(normalizeHop("1.2.3.4:8080")).toBe("1.2.3.4");
    });

    it("leaves plain IPv4 unchanged", () => {
      expect(normalizeHop("1.2.3.4")).toBe("1.2.3.4");
    });

    it("strips zone-id from IPv6 address", () => {
      expect(normalizeHop("fe80::1%eth0")).toBe("fe80::1");
    });

    it("leaves plain IPv6 unchanged", () => {
      expect(normalizeHop("::1")).toBe("::1");
    });

    it("strips brackets+port from bracketed IPv6 address", () => {
      expect(normalizeHop("[2001:db8::1]:3000")).toBe("2001:db8::1");
    });

    it("strips brackets+port and zone-id from bracketed IPv6 with zone", () => {
      expect(normalizeHop("[fe80::1%eth0]:80")).toBe("fe80::1");
    });

    it("garbage string does not throw and returns the string as-is", () => {
      expect(() => normalizeHop("not_an_ip_at_all")).not.toThrow();
      expect(normalizeHop("not_an_ip_at_all")).toBe("not_an_ip_at_all");
    });
  });

  describe("resolveClientIp", () => {
    afterEach(async () => {
      const { env: e } = await import("../env");
      (e as Record<string, unknown>).TRUSTED_PROXIES = undefined;
    });

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
    });

    it("CIDR range: socket inside 10.0.0.0/8 is trusted, XFF client returned", async () => {
      mockedAddress = "10.5.6.7";
      const { env: e } = await import("../env");
      (e as Record<string, unknown>).TRUSTED_PROXIES = ["10.0.0.0/8"];

      const app = new Hono();
      app.get("/ip", (c) => c.json({ ip: resolveClientIp(c) }));
      const res = await app.request("/ip", {
        headers: { "x-forwarded-for": "203.0.113.1" },
      });
      const body = (await res.json()) as { ip: string };
      expect(body.ip).toBe("203.0.113.1");
    });

    it("`private` keyword trusts an IPv6 ULA proxy (Railway), returns XFF client", async () => {
      mockedAddress = "fd12:3456:789a::1";
      const { env: e } = await import("../env");
      (e as Record<string, unknown>).TRUSTED_PROXIES = ["private"];

      const app = new Hono();
      app.get("/ip", (c) => c.json({ ip: resolveClientIp(c) }));
      const res = await app.request("/ip", {
        headers: { "x-forwarded-for": "203.0.113.9" },
      });
      const body = (await res.json()) as { ip: string };
      expect(body.ip).toBe("203.0.113.9");
    });

    it("`private` keyword trusts a CGNAT (100.64.0.0/10) proxy", async () => {
      mockedAddress = "100.96.1.1";
      const { env: e } = await import("../env");
      (e as Record<string, unknown>).TRUSTED_PROXIES = ["private"];

      const app = new Hono();
      app.get("/ip", (c) => c.json({ ip: resolveClientIp(c) }));
      const res = await app.request("/ip", {
        headers: { "x-forwarded-for": "198.51.100.7" },
      });
      const body = (await res.json()) as { ip: string };
      expect(body.ip).toBe("198.51.100.7");
    });

    it("public socket address is NOT trusted even with `private` set", async () => {
      mockedAddress = "8.8.8.8";
      const { env: e } = await import("../env");
      (e as Record<string, unknown>).TRUSTED_PROXIES = ["private"];

      const app = new Hono();
      app.get("/ip", (c) => c.json({ ip: resolveClientIp(c) }));
      const res = await app.request("/ip", {
        headers: { "x-forwarded-for": "1.2.3.4" },
      });
      const body = (await res.json()) as { ip: string };
      expect(body.ip).toBe("8.8.8.8");
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
    });

    it("port-suffixed trusted proxy socket is recognised as trusted", async () => {
      mockedAddress = "10.0.0.1:12345";
      const { env: e } = await import("../env");
      (e as Record<string, unknown>).TRUSTED_PROXIES = ["10.0.0.1"];

      const app = new Hono();
      app.get("/ip", (c) => c.json({ ip: resolveClientIp(c) }));
      const res = await app.request("/ip", {
        headers: { "x-forwarded-for": "203.0.113.1" },
      });
      const body = (await res.json()) as { ip: string };
      expect(body.ip).toBe("203.0.113.1");
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
      app.use("*", requireRateLimit({ limiter }, AUTH_SIGN_IN_POLICY));
      app.post("/api/auth/sign-in/email", (c) => c.json({ ok: true }));
      app.onError(createErrorHandler(makeNoop()));

      await app.request("/api/auth/sign-in/email", { method: "POST" });
      expect(capturedKey).toBe("auth-sign-in:9.9.9.9");
    });
  });

  describe("security event emission on firstBlock", () => {
    function makeOutbox(): IOutboxRepository {
      return {
        enqueue: mock(async () => {}),
        findPendingBatch: async () => [],
        markDispatched: async () => {},
        markFailed: async () => {},
      };
    }

    function makeAuthApp(
      limiter: IRateLimiter,
      outbox: IOutboxRepository | undefined,
      user: { id: string } | null = null,
    ) {
      const app = new Hono<{ Variables: { requestId: string; user: { id: string } | null } }>();
      app.use("*", async (c, next) => {
        c.set("requestId", "req-sec");
        c.set("user", user);
        await next();
      });
      app.use(
        "/api/auth/sign-in/email",
        requireRateLimit({ limiter, outbox }, AUTH_SIGN_IN_POLICY),
      );
      app.post("/api/auth/sign-in/email", (c) => c.json({ ok: true }));
      app.onError(createErrorHandler(makeNoop()));
      return app;
    }

    it("emits security.rate_limit.exceeded when firstBlock=true, emitSecurityEvent=true, outbox provided", async () => {
      mockedAddress = "1.2.3.4";
      const outbox = makeOutbox();
      const limiter = makeLimiter(blockDecision("auth-sign-in"));
      const app = makeAuthApp(limiter, outbox);

      const res = await app.request("/api/auth/sign-in/email", { method: "POST" });
      expect(res.status).toBe(429);
      expect(outbox.enqueue).toHaveBeenCalledTimes(1);

      const [events, scope] = (outbox.enqueue as ReturnType<typeof mock>).mock.calls[0] as [
        Array<{ eventType: string; payload: unknown }>,
        unknown,
      ];
      expect(events[0]?.eventType).toBe("security.rate_limit.exceeded");
      expect(scope).toMatchObject({ aggregateType: "rate_limit" });
      const payload = events[0]?.payload as Record<string, unknown>;
      expect(payload.ip).toBe("1.2.3.4");
      expect(payload.policyName).toBe("auth-sign-in");
      expect(payload.actorUserId).toBeNull();
    });

    it("actorUserId is the user.id when user is in context", async () => {
      mockedAddress = "1.2.3.4";
      const outbox = makeOutbox();
      const limiter = makeLimiter(blockDecision("auth-sign-in"));
      const app = makeAuthApp(limiter, outbox, { id: "u-42" });

      await app.request("/api/auth/sign-in/email", { method: "POST" });

      const [events] = (outbox.enqueue as ReturnType<typeof mock>).mock.calls[0] as [
        Array<{ payload: Record<string, unknown> }>,
      ];
      expect(events[0]?.payload.actorUserId).toBe("u-42");
    });

    it("does NOT emit when firstBlock=false", async () => {
      mockedAddress = "1.2.3.4";
      const outbox = makeOutbox();
      const nonFirstBlock: RateLimitDecision = {
        allowed: false,
        limit: 5,
        remaining: 0,
        resetSeconds: 45,
        policyName: "auth-sign-in",
        firstBlock: false,
      };
      const limiter = makeLimiter(nonFirstBlock);
      const app = makeAuthApp(limiter, outbox);

      const res = await app.request("/api/auth/sign-in/email", { method: "POST" });
      expect(res.status).toBe(429);
      expect(outbox.enqueue).not.toHaveBeenCalled();
    });

    it("does NOT emit when policy.emitSecurityEvent is absent (GLOBAL_POLICY)", async () => {
      mockedAddress = "1.2.3.4";
      const outbox = makeOutbox();
      const app = new Hono<{ Variables: { requestId: string; user: null } }>();
      app.use("*", async (c, next) => {
        c.set("requestId", "req-global");
        c.set("user", null);
        await next();
      });
      app.use(
        "*",
        requireRateLimit({ limiter: makeLimiter(blockDecision()), outbox }, GLOBAL_POLICY),
      );
      app.get("/ok", (c) => c.json({ ok: true }));
      app.onError(createErrorHandler(makeNoop()));

      const res = await app.request("/ok");
      expect(res.status).toBe(429);
      expect(outbox.enqueue).not.toHaveBeenCalled();
    });

    it("does NOT emit when outbox is not provided", async () => {
      mockedAddress = "1.2.3.4";
      const limiter = makeLimiter(blockDecision("auth-sign-in"));
      const app = makeAuthApp(limiter, undefined);

      const res = await app.request("/api/auth/sign-in/email", { method: "POST" });
      expect(res.status).toBe(429);
    });

    it("still returns 429 when emit throws, and logger.warn is called once with the error", async () => {
      mockedAddress = "1.2.3.4";
      warnSpy.mockClear();
      const outbox: IOutboxRepository = {
        enqueue: mock(async () => {
          throw new Error("outbox down");
        }),
        findPendingBatch: async () => [],
        markDispatched: async () => {},
        markFailed: async () => {},
      };
      const limiter = makeLimiter(blockDecision("auth-sign-in"));
      const app = makeAuthApp(limiter, outbox);

      const res = await app.request("/api/auth/sign-in/email", { method: "POST" });
      expect(res.status).toBe(429);
      expect(warnSpy).toHaveBeenCalledTimes(1);
      const warnArg = (warnSpy.mock.calls as unknown[][])[0]?.[0] as Record<string, unknown>;
      expect((warnArg.err as Error).message).toBe("outbox down");
    });

    it("path and method are captured correctly", async () => {
      mockedAddress = "1.2.3.4";
      const outbox = makeOutbox();
      const limiter = makeLimiter(blockDecision("auth-sign-in"));
      const app = makeAuthApp(limiter, outbox);

      await app.request("/api/auth/sign-in/email", { method: "POST" });

      const [events] = (outbox.enqueue as ReturnType<typeof mock>).mock.calls[0] as [
        Array<{ payload: Record<string, unknown> }>,
      ];
      expect(events[0]?.payload.path).toBe("/api/auth/sign-in/email");
      expect(events[0]?.payload.method).toBe("POST");
    });

    it("truncates oversized XFF-derived ip to 45 chars in payload, no throw", async () => {
      // IPv6 max = 39 chars; this simulates a pathological value (e.g. spoofed XFF header).
      mockedAddress = "1.2.3.4";
      const { env: e } = await import("../env");
      (e as Record<string, unknown>).TRUSTED_PROXIES = ["1.2.3.4"];

      const oversizedIp = "a".repeat(60);
      const outbox = makeOutbox();
      const limiter = makeLimiter(blockDecision("auth-sign-in"));
      const app = makeAuthApp(limiter, outbox);

      const res = await app.request("/api/auth/sign-in/email", {
        method: "POST",
        headers: { "x-forwarded-for": oversizedIp },
      });

      expect(res.status).toBe(429);
      expect(outbox.enqueue).toHaveBeenCalledTimes(1);
      const [events] = (outbox.enqueue as ReturnType<typeof mock>).mock.calls[0] as [
        Array<{ payload: Record<string, unknown> }>,
      ];
      expect(events[0]?.payload.ip).toBe("a".repeat(45));

      (e as Record<string, unknown>).TRUSTED_PROXIES = undefined;
    });
  });

  describe("advertiseBudget suppression", () => {
    function makeAuthPolicyNoAdvertise(): PolicyConfig {
      return {
        name: "auth-sign-in",
        keyFn: (c) => `auth-sign-in:${resolveClientIp(c)}`,
        windows: [{ policyName: "auth-sign-in", windowSec: 900, maxRequests: 5 }],
        emitSecurityEvent: true,
        advertiseBudget: false,
      };
    }

    it("no RateLimit headers on 200 when advertiseBudget=false", async () => {
      mockedAddress = "1.2.3.4";
      const app = new Hono<{ Variables: { requestId: string; user: null } }>();
      app.use("*", async (c, next) => {
        c.set("requestId", "r");
        c.set("user", null);
        await next();
      });
      app.use(
        "*",
        requireRateLimit(
          { limiter: makeLimiter(allowDecision("auth-sign-in")), outbox: undefined },
          makeAuthPolicyNoAdvertise(),
        ),
      );
      app.get("/ok", (c) => c.json({ ok: true }));
      app.onError(createErrorHandler(makeNoop()));

      const res = await app.request("/ok");
      expect(res.status).toBe(200);
      expect(res.headers.get("RateLimit-Policy")).toBeNull();
      expect(res.headers.get("RateLimit")).toBeNull();
    });

    it("no RateLimit headers on 429 when advertiseBudget=false, but Retry-After is present", async () => {
      mockedAddress = "1.2.3.4";
      const app = new Hono<{ Variables: { requestId: string; user: null } }>();
      app.use("*", async (c, next) => {
        c.set("requestId", "r");
        c.set("user", null);
        await next();
      });
      app.use(
        "*",
        requireRateLimit(
          { limiter: makeLimiter(blockDecision("auth-sign-in")), outbox: undefined },
          makeAuthPolicyNoAdvertise(),
        ),
      );
      app.get("/ok", (c) => c.json({ ok: true }));
      app.onError(createErrorHandler(makeNoop()));

      const res = await app.request("/ok");
      expect(res.status).toBe(429);
      expect(res.headers.get("RateLimit-Policy")).toBeNull();
      expect(res.headers.get("RateLimit")).toBeNull();
      expect(res.headers.get("Retry-After")).toBe("45");
    });

    it("RateLimit headers present when advertiseBudget is not set (GLOBAL_POLICY default)", async () => {
      const app = makeApp(makeLimiter(allowDecision()));
      const res = await app.request("/ok");
      expect(res.headers.get("RateLimit-Policy")).toBeTruthy();
      expect(res.headers.get("RateLimit")).toBeTruthy();
    });
  });

  describe("options-time misconfiguration warn", () => {
    it("logs warn once at factory time when emitSecurityEvent=true and no outbox", () => {
      warnSpy.mockClear();
      requireRateLimit({ limiter: makeLimiter(allowDecision()) }, AUTH_SIGN_IN_POLICY);
      expect(warnSpy).toHaveBeenCalledTimes(1);
      const warnArg = (warnSpy.mock.calls as unknown[][])[0]?.[0] as Record<string, unknown>;
      expect(warnArg.policy).toBe("auth-sign-in");
    });

    it("does NOT warn when outbox is provided", () => {
      warnSpy.mockClear();
      const outbox: IOutboxRepository = {
        enqueue: async () => {},
        findPendingBatch: async () => [],
        markDispatched: async () => {},
        markFailed: async () => {},
      };
      requireRateLimit({ limiter: makeLimiter(allowDecision()), outbox }, AUTH_SIGN_IN_POLICY);
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it("does NOT warn for GLOBAL_POLICY (emitSecurityEvent not set)", () => {
      warnSpy.mockClear();
      requireRateLimit({ limiter: makeLimiter(allowDecision()) }, GLOBAL_POLICY);
      expect(warnSpy).not.toHaveBeenCalled();
    });
  });
});
