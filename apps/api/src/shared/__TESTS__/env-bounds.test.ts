import { describe, expect, it } from "bun:test";
import { z } from "zod";
import {
  EMAIL_SEND_TIMEOUT_SECONDS,
  EMAIL_SETTLE_MARGIN_SECONDS,
  frontOrigins,
  OUTBOX_SETTLE_MARGIN_SECONDS,
  validateApprovalEnv,
  validateEnvBounds,
  validateHostsEnv,
  WEBHOOK_DNS_TIMEOUT_SECONDS,
  WEBHOOK_FETCH_TIMEOUT_SECONDS,
  WEBHOOK_SETTLE_MARGIN_SECONDS,
} from "../env-bounds";

// Exercises the real guard (`superRefine` in env.ts) against plain literals. Never
// imports `env.ts` itself, since env.ts parses `process.env` at import time and throws
// on a missing `DATABASE_URL` and friends. No `.env` required for this file.
const boundsSchema = z
  .object({
    SERVER_IDLE_TIMEOUT_SECONDS: z.number(),
    SWEEP_DEADLINE_MS: z.number(),
    INTERNAL_FETCH_TIMEOUT_MS: z.number(),
    SHUTDOWN_GRACE_PERIOD_MS: z.number(),
    SHUTDOWN_STEP_TIMEOUT_MS: z.number(),
    SHUTDOWN_WORKERS_TIMEOUT_MS: z.number(),
    SHUTDOWN_DEADLINE_MS: z.number(),
    OUTBOX_LEASE_SECONDS: z.number(),
    OUTBOX_HANDLER_BUDGET_SECONDS: z.number(),
    EMAIL_LEASE_SECONDS: z.number(),
    EMAIL_DEAD_RETRY_HOURS: z.number(),
    EMAIL_DEAD_REPLAY_WINDOW_HOURS: z.number(),
    WEBHOOK_LEASE_SECONDS: z.number(),
  })
  .superRefine(validateEnvBounds);

const SHUTDOWN_DEFAULTS = {
  SHUTDOWN_GRACE_PERIOD_MS: 15_000,
  SHUTDOWN_STEP_TIMEOUT_MS: 2_000,
  SHUTDOWN_WORKERS_TIMEOUT_MS: 12_000,
  SHUTDOWN_DEADLINE_MS: 36_000,
};

const QUEUE_DEFAULTS = {
  OUTBOX_LEASE_SECONDS: 120,
  OUTBOX_HANDLER_BUDGET_SECONDS: 30,
  EMAIL_LEASE_SECONDS: 120,
  EMAIL_DEAD_RETRY_HOURS: 6,
  EMAIL_DEAD_REPLAY_WINDOW_HOURS: 24,
  WEBHOOK_LEASE_SECONDS: 330,
};

describe("validateEnvBounds", () => {
  it("accepts the three defaults", () => {
    const result = boundsSchema.safeParse({
      SERVER_IDLE_TIMEOUT_SECONDS: 120,
      SWEEP_DEADLINE_MS: 90_000,
      INTERNAL_FETCH_TIMEOUT_MS: 150_000,
      ...SHUTDOWN_DEFAULTS,
      ...QUEUE_DEFAULTS,
    });
    expect(result.success).toBe(true);
  });

  it("rejects SWEEP_DEADLINE_MS equal to the idle timeout in ms (boundary)", () => {
    const result = boundsSchema.safeParse({
      SERVER_IDLE_TIMEOUT_SECONDS: 120,
      SWEEP_DEADLINE_MS: 120_000,
      INTERNAL_FETCH_TIMEOUT_MS: 150_000,
      ...SHUTDOWN_DEFAULTS,
      ...QUEUE_DEFAULTS,
    });
    expect(result.success).toBe(false);
  });

  it("rejects SWEEP_DEADLINE_MS above the idle timeout in ms", () => {
    const result = boundsSchema.safeParse({
      SERVER_IDLE_TIMEOUT_SECONDS: 120,
      SWEEP_DEADLINE_MS: 130_000,
      INTERNAL_FETCH_TIMEOUT_MS: 150_000,
      ...SHUTDOWN_DEFAULTS,
      ...QUEUE_DEFAULTS,
    });
    expect(result.success).toBe(false);
  });

  it("rejects INTERNAL_FETCH_TIMEOUT_MS equal to the idle timeout in ms (boundary)", () => {
    const result = boundsSchema.safeParse({
      SERVER_IDLE_TIMEOUT_SECONDS: 120,
      SWEEP_DEADLINE_MS: 90_000,
      INTERNAL_FETCH_TIMEOUT_MS: 120_000,
      ...SHUTDOWN_DEFAULTS,
      ...QUEUE_DEFAULTS,
    });
    expect(result.success).toBe(false);
  });

  it("rejects INTERNAL_FETCH_TIMEOUT_MS below the idle timeout in ms", () => {
    const result = boundsSchema.safeParse({
      SERVER_IDLE_TIMEOUT_SECONDS: 120,
      SWEEP_DEADLINE_MS: 90_000,
      INTERNAL_FETCH_TIMEOUT_MS: 100_000,
      ...SHUTDOWN_DEFAULTS,
      ...QUEUE_DEFAULTS,
    });
    expect(result.success).toBe(false);
  });

  it("accepts a shutdown deadline equal to the worst case and rejects one millisecond less", () => {
    const sweepBounds = {
      SERVER_IDLE_TIMEOUT_SECONDS: 120,
      SWEEP_DEADLINE_MS: 90_000,
      INTERNAL_FETCH_TIMEOUT_MS: 150_000,
    };
    const worstCaseMs = 15_000 + 1_000 + 2_000 + 12_000 + 2_000 + 2_000 + 500 + 1_000;

    const atBudget = boundsSchema.safeParse({
      ...sweepBounds,
      ...SHUTDOWN_DEFAULTS,
      ...QUEUE_DEFAULTS,
      SHUTDOWN_DEADLINE_MS: worstCaseMs,
    });
    const belowBudget = boundsSchema.safeParse({
      ...sweepBounds,
      ...SHUTDOWN_DEFAULTS,
      ...QUEUE_DEFAULTS,
      SHUTDOWN_DEADLINE_MS: worstCaseMs - 1,
    });

    expect(atBudget.success).toBe(true);
    expect(belowBudget.success).toBe(false);
  });

  it("rejects an outbox lease that leaves no settle margin after one handler budget and accepts the exact margin", () => {
    const bounds = {
      SERVER_IDLE_TIMEOUT_SECONDS: 120,
      SWEEP_DEADLINE_MS: 90_000,
      INTERNAL_FETCH_TIMEOUT_MS: 150_000,
      ...SHUTDOWN_DEFAULTS,
      ...QUEUE_DEFAULTS,
    };

    const withMargin = boundsSchema.safeParse({
      ...bounds,
      OUTBOX_LEASE_SECONDS: 30 + OUTBOX_SETTLE_MARGIN_SECONDS,
      OUTBOX_HANDLER_BUDGET_SECONDS: 30,
    });
    const equalToBudget = boundsSchema.safeParse({
      ...bounds,
      OUTBOX_LEASE_SECONDS: 30,
      OUTBOX_HANDLER_BUDGET_SECONDS: 30,
    });

    expect(withMargin.success).toBe(true);
    expect(equalToBudget.success).toBe(false);
  });

  it("rejects an email replay window that closes before the first dead replay is due", () => {
    const bounds = {
      SERVER_IDLE_TIMEOUT_SECONDS: 120,
      SWEEP_DEADLINE_MS: 90_000,
      INTERNAL_FETCH_TIMEOUT_MS: 150_000,
      ...SHUTDOWN_DEFAULTS,
      ...QUEUE_DEFAULTS,
    };

    const longer = boundsSchema.safeParse({ ...bounds, EMAIL_DEAD_REPLAY_WINDOW_HOURS: 7 });
    const equal = boundsSchema.safeParse({ ...bounds, EMAIL_DEAD_REPLAY_WINDOW_HOURS: 6 });

    expect(longer.success).toBe(true);
    expect(equal.success).toBe(false);
  });

  it("rejects an email lease shorter than one send timeout plus the settle margin", () => {
    const bounds = {
      SERVER_IDLE_TIMEOUT_SECONDS: 120,
      SWEEP_DEADLINE_MS: 90_000,
      INTERNAL_FETCH_TIMEOUT_MS: 150_000,
      ...SHUTDOWN_DEFAULTS,
      ...QUEUE_DEFAULTS,
    };
    const floor = EMAIL_SEND_TIMEOUT_SECONDS + EMAIL_SETTLE_MARGIN_SECONDS;

    const atFloor = boundsSchema.safeParse({ ...bounds, EMAIL_LEASE_SECONDS: floor });
    const below = boundsSchema.safeParse({ ...bounds, EMAIL_LEASE_SECONDS: floor - 1 });

    expect(atFloor.success).toBe(true);
    expect(below.success).toBe(false);
  });

  it("rejects a webhook lease shorter than one lookup and delivery timeout plus the settle margin", () => {
    const bounds = {
      SERVER_IDLE_TIMEOUT_SECONDS: 120,
      SWEEP_DEADLINE_MS: 90_000,
      INTERNAL_FETCH_TIMEOUT_MS: 150_000,
      ...SHUTDOWN_DEFAULTS,
      ...QUEUE_DEFAULTS,
    };
    const floor =
      WEBHOOK_DNS_TIMEOUT_SECONDS + WEBHOOK_FETCH_TIMEOUT_SECONDS + WEBHOOK_SETTLE_MARGIN_SECONDS;

    const atFloor = boundsSchema.safeParse({ ...bounds, WEBHOOK_LEASE_SECONDS: floor });
    const below = boundsSchema.safeParse({ ...bounds, WEBHOOK_LEASE_SECONDS: floor - 1 });

    expect(atFloor.success).toBe(true);
    expect(below.success).toBe(false);
  });
});

describe("validateApprovalEnv", () => {
  const schema = z
    .object({
      ADMIN_APPROVAL_ENABLED: z.boolean(),
      ADMIN_APPROVAL_ACTIONS: z.array(z.string()),
    })
    .superRefine(validateApprovalEnv);

  it("refuses four-eyes switched on with nothing to gate", () => {
    const parsed = schema.safeParse({ ADMIN_APPROVAL_ENABLED: true, ADMIN_APPROVAL_ACTIONS: [] });

    expect(parsed.success).toBe(false);
  });

  it("lets an empty list stand while four-eyes is off", () => {
    const parsed = schema.safeParse({ ADMIN_APPROVAL_ENABLED: false, ADMIN_APPROVAL_ACTIONS: [] });

    expect(parsed.success).toBe(true);
  });
});

describe("validateHostsEnv", () => {
  const schema = z
    .object({
      NODE_ENV: z.string(),
      ADMIN_URL: z.string().optional(),
      APP_URL: z.string(),
      BETTER_AUTH_URL: z.string(),
      AUTH_COOKIE_DOMAIN: z.string().optional(),
    })
    .superRefine(validateHostsEnv);
  const hosts = {
    NODE_ENV: "production",
    ADMIN_URL: "https://admin.example.com",
    APP_URL: "https://app.example.com",
    BETTER_AUTH_URL: "https://api.example.com",
  };

  it("accepts a parent domain of every host", () => {
    expect(schema.safeParse({ ...hosts, AUTH_COOKIE_DOMAIN: "example.com" }).success).toBe(true);
  });

  it("accepts no admin host and no cookie domain", () => {
    const { ADMIN_URL: _admin, ...withoutAdmin } = hosts;

    expect(schema.safeParse(withoutAdmin).success).toBe(true);
  });

  it.each([
    ["a host outside the parent", { AUTH_COOKIE_DOMAIN: "other.example" }],
    ["a suffix that is not a parent", { AUTH_COOKIE_DOMAIN: "ample.com" }],
    ["a leading dot", { AUTH_COOKIE_DOMAIN: ".example.com" }],
    ["a bare top-level name", { AUTH_COOKIE_DOMAIN: "localhost" }],
    ["an admin url with a path", { ADMIN_URL: "https://admin.example.com/back" }],
    ["an admin url with a trailing slash", { ADMIN_URL: "https://admin.example.com/" }],
    ["a cleartext admin url in production", { ADMIN_URL: "http://admin.example.com" }],
  ])("refuses %s", (_label, override) => {
    expect(schema.safeParse({ ...hosts, ...override }).success).toBe(false);
  });

  it("lets a cleartext admin url stand outside production", () => {
    const parsed = schema.safeParse({
      ...hosts,
      NODE_ENV: "development",
      ADMIN_URL: "http://localhost:5174",
    });

    expect(parsed.success).toBe(true);
  });
});

describe("frontOrigins", () => {
  it("adds the admin origin to the allowlist once", () => {
    const admin = "https://admin.example.com";

    expect(frontOrigins({ CORS_ORIGIN: ["https://app.example.com"], ADMIN_URL: admin })).toEqual([
      "https://app.example.com",
      admin,
    ]);
    expect(frontOrigins({ CORS_ORIGIN: [admin], ADMIN_URL: admin })).toEqual([admin]);
  });

  it("keeps the local fallback without any configuration", () => {
    expect(frontOrigins({})).toEqual(["http://localhost:5173"]);
  });
});
