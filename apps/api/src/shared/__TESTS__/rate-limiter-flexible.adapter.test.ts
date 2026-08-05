/**
 * Coverage: RateLimiterFlexibleAdapter logic + factory option-mapping.
 *
 * Store I/O (Postgres round-trips) is the responsibility of the rate-limiter-flexible
 * library; integration coverage requires a real DB and lives outside this unit suite.
 * The drizzleFactory constructor-argument mapping is verified by spying the constructor
 * (mock.module on rate-limiter-flexible) — no real DB queries are issued.
 *
 * firstBlock strict-equality concurrency note:
 *   Postgres store: RateLimiterDrizzle uses ON CONFLICT … DO UPDATE with an atomic
 *   SQL increment inside a transaction, so consumedPoints increments consecutively.
 *   Exactly one request observes consumedPoints === maxRequests + 1 (the first reject);
 *   every subsequent reject has consumedPoints > maxRequests + 1 → firstBlock=false.
 *   In-memory short-circuit (inMemoryBlockOnConsumed): once the in-process block fires,
 *   the lib returns a synthetic RateLimiterRes with consumedPoints=0, which never equals
 *   maxRequests+1 → firstBlock=false. These semantics are the library's responsibility.
 */

import { beforeEach, describe, expect, it, mock } from "bun:test";
// Import real lib exports before mock.module (mock.module callback is synchronous).
import {
  RateLimiterMemory as RealRateLimiterMemory,
  RateLimiterRes as RealRateLimiterRes,
} from "rate-limiter-flexible";
import type { IInstrumentation } from "../ports/instrumentation.port";
import type { WindowConfig } from "../ports/rate-limiter.port";

// ── Mock @packages/drizzle ──────────────────────────────────────────────────
// The adapter imports `rateLimitSchema` + the `RateLimitDbClient` type; the container
// imports `getRateLimitDbClient`. Superset rule: expose all exports used anywhere in
// the test suite (the mock leaks cross-test via bun's parallel `mock.module`).
const fakeDb = {};
const fakeRateLimitClient = {};
const fakeRateLimitRecord = { key: {}, points: {}, expire: {} };

mock.module("@packages/drizzle", () => ({
  db: fakeDb,
  getRateLimitDbClient: () => fakeRateLimitClient,
  eq: () => ({}),
  and: (..._args: unknown[]) => ({}),
  or: (..._args: unknown[]) => ({}),
  isNull: () => ({}),
  isNotNull: () => ({}),
  lt: () => ({}),
  lte: () => ({}),
  gt: () => ({}),
  gte: () => ({}),
  not: () => ({}),
  asc: () => ({}),
  desc: () => ({}),
  like: () => ({}),
  inArray: () => ({}),
  count: () => ({}),
  arrayContains: () => ({}),
  sql: Object.assign((_strings: TemplateStringsArray, ..._values: unknown[]) => ({}), {
    raw: () => ({}),
  }),
  outboxSchema: { outboxEvent: {} },
  auditLogSchema: { auditLog: {} },
  webhooksSchema: { webhookDelivery: {} },
  multiTenantSchema: {},
  authSchema: {},
  schema: {},
  trackEventsOnSuccess: () => {},
  TransactionService: class {},
  rateLimitSchema: { rateLimitRecord: fakeRateLimitRecord },
  billingSchema: {},
  quotaUsageSchema: {
    quotaUsage: { organizationId: {}, resource: {}, periodStart: {}, used: {}, updatedAt: {} },
  },
  policiesSchema: {},
  consentSchema: {},
}));

// ── Mock rate-limiter-flexible ──────────────────────────────────────────────
// Full superset of all exports used anywhere in this test suite.
// RateLimiterDrizzle is a spy constructor — no real DB calls.
const drizzleCtorCalls: unknown[] = [];

class FakeRateLimiterDrizzle {
  static _calls = drizzleCtorCalls;
  _opts: unknown;
  constructor(opts: unknown) {
    this._opts = opts;
    drizzleCtorCalls.push(opts);
  }
}

mock.module("rate-limiter-flexible", () => ({
  RateLimiterMemory: RealRateLimiterMemory,
  RateLimiterRes: RealRateLimiterRes,
  RateLimiterDrizzle: FakeRateLimiterDrizzle,
  RateLimiterRedis: class {},
  RateLimiterRedisNonAtomic: class {},
  RateLimiterMongo: class {},
  RateLimiterMySQL: class {},
  RateLimiterPostgres: class {},
  RateLimiterClusterMaster: class {},
  RateLimiterClusterMasterPM2: class {},
  RateLimiterCluster: class {},
  RLWrapperBlackAndWhite: class {},
  RLWrapperTimeouts: class {},
  RateLimiterUnion: class {},
  RateLimiterQueue: class {},
  BurstyRateLimiter: class {},
  RateLimiterCompatibleAbstract: class {},
  RateLimiterDynamo: class {},
  RateLimiterPrisma: class {},
  RateLimiterValkey: class {},
  RateLimiterValkeyGlide: class {},
  RateLimiterSQLite: class {},
  RateLimiterEtcd: class {},
  RateLimiterDrizzleNonAtomic: class {},
  RateLimiterEtcdNonAtomic: class {},
  RateLimiterQueueError: class {},
  RateLimiterEtcdTransactionFailedError: class {},
}));

const { RateLimiterFlexibleAdapter, memoryFactory, makeDrizzleFactory, storeFactoryFor } =
  await import("../services/rate-limiter-flexible.adapter");

function makeNoopInstrumentation(): IInstrumentation {
  return {
    startSpan: (_opts, cb) => cb() as ReturnType<typeof cb>,
    capture: () => {},
    addBreadcrumb: () => {},
  };
}

function makeAdapter() {
  return new RateLimiterFlexibleAdapter(makeNoopInstrumentation(), memoryFactory);
}

const WINDOW_1S: WindowConfig = { policyName: "test", windowSec: 1, maxRequests: 3 };

describe("RateLimiterFlexibleAdapter (memoryFactory)", () => {
  describe("within-limit", () => {
    it("allows a request and returns isSuccess with decremented remaining", async () => {
      const result = await makeAdapter().consume("ip-1", [WINDOW_1S]);
      expect(result.isSuccess).toBe(true);
      const v = result.getValue();
      expect(v.allowed).toBe(true);
      expect(v.remaining).toBe(2);
      expect(v.limit).toBe(3);
      expect(v.policyName).toBe("test");
    });

    it("decrements remaining on subsequent requests", async () => {
      const adapter = makeAdapter();
      await adapter.consume("ip-2", [WINDOW_1S]);
      const result = await adapter.consume("ip-2", [WINDOW_1S]);
      expect(result.isSuccess).toBe(true);
      expect(result.getValue().remaining).toBe(1);
    });
  });

  describe("over-limit", () => {
    it("returns allowed:false when limit exceeded", async () => {
      const adapter = makeAdapter();
      const key = "ip-over-limit";
      await adapter.consume(key, [WINDOW_1S]);
      await adapter.consume(key, [WINDOW_1S]);
      await adapter.consume(key, [WINDOW_1S]);
      const result = await adapter.consume(key, [WINDOW_1S]);
      expect(result.isSuccess).toBe(true);
      const v = result.getValue();
      expect(v.allowed).toBe(false);
      expect(v.remaining).toBe(0);
      expect(v.resetSeconds).toBeGreaterThan(0);
    });
  });

  describe("empty windows", () => {
    it("returns allowed when no windows are configured", async () => {
      const result = await makeAdapter().consume("ip-empty", []);
      expect(result.isSuccess).toBe(true);
      const v = result.getValue();
      expect(v.allowed).toBe(true);
      expect(v.firstBlock).toBe(false);
    });
  });

  describe("multi-window fail-fast", () => {
    it("stops at first blocked window even if longer window would allow", async () => {
      const tightWindow: WindowConfig = { policyName: "tight", windowSec: 2, maxRequests: 1 };
      const looseWindow: WindowConfig = { policyName: "loose", windowSec: 10, maxRequests: 100 };
      const adapter = makeAdapter();
      const key = "ip-multiwindow";

      await adapter.consume(key, [tightWindow, looseWindow]);
      const result = await adapter.consume(key, [tightWindow, looseWindow]);

      expect(result.isSuccess).toBe(true);
      const v = result.getValue();
      expect(v.allowed).toBe(false);
      expect(v.policyName).toBe("tight");
    });

    it("returns the decision of the window with the lowest remaining when all pass", async () => {
      const windowA: WindowConfig = { policyName: "wA", windowSec: 5, maxRequests: 10 };
      const windowB: WindowConfig = { policyName: "wB", windowSec: 60, maxRequests: 3 };
      const key = "ip-lowest";

      const result = await makeAdapter().consume(key, [windowA, windowB]);

      expect(result.isSuccess).toBe(true);
      const v = result.getValue();
      expect(v.allowed).toBe(true);
      expect(v.policyName).toBe("wB");
      expect(v.remaining).toBe(2);
    });
  });

  describe("independent counters", () => {
    it("maintains separate counters per policyName even with same windowSec", async () => {
      const windowX: WindowConfig = { policyName: "policy-x", windowSec: 5, maxRequests: 2 };
      const windowY: WindowConfig = { policyName: "policy-y", windowSec: 5, maxRequests: 2 };
      const adapter = makeAdapter();
      const key = "ip-independent";

      await adapter.consume(key, [windowX]);
      await adapter.consume(key, [windowX]);
      const blockedByX = await adapter.consume(key, [windowX]);

      expect(blockedByX.isSuccess).toBe(true);
      expect(blockedByX.getValue().allowed).toBe(false);

      const allowedByY = await adapter.consume(key, [windowY]);
      expect(allowedByY.isSuccess).toBe(true);
      expect(allowedByY.getValue().allowed).toBe(true);
    });
  });

  describe("instrumentation.capture on internal error", () => {
    it("calls instrumentation.capture and returns isFailure on unexpected error", async () => {
      const captureSpy = mock(() => {});
      const instrumentation: IInstrumentation = {
        startSpan: (_opts, cb) => cb() as ReturnType<typeof cb>,
        capture: captureSpy,
        addBreadcrumb: () => {},
      };

      const adapter = new RateLimiterFlexibleAdapter(instrumentation, memoryFactory);

      const invalidWindow: WindowConfig = {
        policyName: "bad",
        windowSec: -1,
        maxRequests: -1,
      };

      const result = await adapter.consume("ip-error", [invalidWindow]);

      expect(result.isFailure).toBe(true);
      expect(result.getError().code).toBe("RATE_LIMITER_INTERNAL_ERROR");
      expect(captureSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe("resetSeconds", () => {
    it("returns positive resetSeconds when remaining=0 after limit exceeded", async () => {
      const window: WindowConfig = { policyName: "reset-test", windowSec: 60, maxRequests: 1 };
      const adapter = makeAdapter();
      const key = "ip-reset";

      await adapter.consume(key, [window]);
      const result = await adapter.consume(key, [window]);

      expect(result.isSuccess).toBe(true);
      const v = result.getValue();
      expect(v.allowed).toBe(false);
      expect(v.resetSeconds).toBeGreaterThan(0);
      expect(v.resetSeconds).toBeLessThanOrEqual(60);
    });

    it("clamps resetSeconds to 0 when msBeforeNext is -1 (no-expiry postgres row)", async () => {
      // RateLimiterDrizzle returns msBeforeNext=-1 when expire IS NULL.
      // Without Math.max the formula yields ceil(-1/1000)=0 — already safe,
      // but explicit guard prevents future regressions if msBeforeNext goes more negative.

      // RateLimiterRes properties are read-only; construct via a stub factory that throws
      // a plain object shaped like RateLimiterRes so toDecision receives msBeforeNext=-1.
      const { RateLimiterRes: Res } = await import("rate-limiter-flexible");
      const fakeRes = Object.assign(Object.create(Res.prototype as object), {
        msBeforeNext: -1,
        remainingPoints: 0,
        consumedPoints: 2,
      }) as InstanceType<typeof Res>;

      const stubFactory = () => ({
        consume: async () => {
          throw fakeRes;
        },
      });

      const adapter = new RateLimiterFlexibleAdapter(
        makeNoopInstrumentation(),
        stubFactory as never,
      );
      const w: WindowConfig = { policyName: "p", windowSec: 60, maxRequests: 1 };
      const result = await adapter.consume("key", [w]);
      expect(result.isSuccess).toBe(true);
      expect(result.getValue().resetSeconds).toBe(0);
    });
  });

  describe("firstBlock", () => {
    it("firstBlock is true on the first request that exceeds the limit", async () => {
      const window: WindowConfig = { policyName: "fb-test", windowSec: 60, maxRequests: 2 };
      const adapter = makeAdapter();
      const key = "ip-firstblock";

      await adapter.consume(key, [window]);
      await adapter.consume(key, [window]);
      const result = await adapter.consume(key, [window]);

      expect(result.isSuccess).toBe(true);
      const v = result.getValue();
      expect(v.allowed).toBe(false);
      expect(v.firstBlock).toBe(true);
    });

    it("firstBlock is false on subsequent blocked requests in same window", async () => {
      const window: WindowConfig = { policyName: "fb-subsequent", windowSec: 60, maxRequests: 2 };
      const adapter = makeAdapter();
      const key = "ip-subsequent";

      await adapter.consume(key, [window]);
      await adapter.consume(key, [window]);
      await adapter.consume(key, [window]); // first block
      const result = await adapter.consume(key, [window]); // subsequent block

      expect(result.isSuccess).toBe(true);
      const v = result.getValue();
      expect(v.allowed).toBe(false);
      expect(v.firstBlock).toBe(false);
    });

    it("firstBlock is false on allowed requests", async () => {
      const window: WindowConfig = { policyName: "fb-allowed", windowSec: 60, maxRequests: 5 };
      const result = await makeAdapter().consume("ip-allowed", [window]);

      expect(result.isSuccess).toBe(true);
      expect(result.getValue().firstBlock).toBe(false);
    });
  });

  describe("span name", () => {
    it("outer span is hardcoded to RateLimiterFlexibleAdapter > consume", async () => {
      const startSpanSpy = mock((_opts: unknown, cb: () => unknown) => cb());
      const instrumentation: IInstrumentation = {
        startSpan: startSpanSpy as unknown as IInstrumentation["startSpan"],
        capture: () => {},
        addBreadcrumb: () => {},
      };

      const adapter = new RateLimiterFlexibleAdapter(instrumentation, memoryFactory);
      await adapter.consume("ip-span", [WINDOW_1S]);

      expect(startSpanSpy).toHaveBeenCalledTimes(1);
      const callArg = startSpanSpy.mock.calls[0]?.[0] as { name: string };
      expect(callArg.name).toBe("RateLimiterFlexibleAdapter > consume");
    });
  });
});

describe("makeDrizzleFactory option-mapping", () => {
  beforeEach(() => {
    drizzleCtorCalls.length = 0;
  });

  it("instantiates RateLimiterDrizzle with the injected client and correct options", () => {
    const window: WindowConfig = {
      policyName: "auth-sign-in",
      windowSec: 900,
      maxRequests: 5,
    };
    makeDrizzleFactory(fakeRateLimitClient as never)(window);

    expect(drizzleCtorCalls).toHaveLength(1);
    const opts = drizzleCtorCalls[0] as Record<string, unknown>;
    expect(opts.storeClient).toBe(fakeRateLimitClient);
    expect(opts.schema).toBe(fakeRateLimitRecord);
    expect(opts.keyPrefix).toBe("auth-sign-in:900");
    expect(opts.points).toBe(5);
    expect(opts.duration).toBe(900);
    expect(opts.inMemoryBlockOnConsumed).toBe(5);
    expect(opts.inMemoryBlockDuration).toBe(900);
  });
});

describe("storeFactoryFor", () => {
  beforeEach(() => {
    drizzleCtorCalls.length = 0;
  });

  it("returns memoryFactory for 'memory'", () => {
    expect(storeFactoryFor("memory")).toBe(memoryFactory);
  });

  it("returns a factory bound to the injected client for 'postgres'", () => {
    const factory = storeFactoryFor("postgres", () => fakeRateLimitClient as never);
    factory({ policyName: "p", windowSec: 60, maxRequests: 1 });

    expect(drizzleCtorCalls).toHaveLength(1);
    expect((drizzleCtorCalls[0] as Record<string, unknown>).storeClient).toBe(fakeRateLimitClient);
  });

  it("does not invoke the client factory for the memory store", () => {
    let called = false;
    storeFactoryFor("memory", () => {
      called = true;
      return fakeRateLimitClient as never;
    });
    expect(called).toBe(false);
  });

  it("throws when the postgres store is requested without a client factory", () => {
    expect(() => storeFactoryFor("postgres")).toThrow("RateLimitDbClient factory is required");
  });
});
