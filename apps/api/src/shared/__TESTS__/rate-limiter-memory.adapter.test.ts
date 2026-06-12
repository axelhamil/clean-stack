import { describe, expect, it, mock } from "bun:test";
import type { IInstrumentation } from "../ports/instrumentation.port";
import type { WindowConfig } from "../ports/rate-limiter.port";
import { RateLimiterMemoryAdapter } from "../services/rate-limiter-memory.adapter";

function makeNoopInstrumentation(): IInstrumentation {
  return {
    startSpan: (_opts, cb) => cb() as ReturnType<typeof cb>,
    capture: () => {},
    addBreadcrumb: () => {},
  };
}

const WINDOW_1S: WindowConfig = { policyName: "test", windowSec: 1, maxRequests: 3 };

describe("RateLimiterMemoryAdapter", () => {
  describe("within-limit", () => {
    it("allows a request and returns isSuccess with decremented remaining", async () => {
      const adapter = new RateLimiterMemoryAdapter(makeNoopInstrumentation());
      const result = await adapter.consume("ip-1", [WINDOW_1S]);
      expect(result.isSuccess).toBe(true);
      const v = result.getValue();
      expect(v.allowed).toBe(true);
      expect(v.remaining).toBe(2);
      expect(v.limit).toBe(3);
      expect(v.policyName).toBe("test");
    });

    it("decrements remaining on subsequent requests", async () => {
      const adapter = new RateLimiterMemoryAdapter(makeNoopInstrumentation());
      await adapter.consume("ip-2", [WINDOW_1S]);
      const result = await adapter.consume("ip-2", [WINDOW_1S]);
      expect(result.isSuccess).toBe(true);
      expect(result.getValue().remaining).toBe(1);
    });
  });

  describe("over-limit", () => {
    it("returns allowed:false when limit exceeded", async () => {
      const adapter = new RateLimiterMemoryAdapter(makeNoopInstrumentation());
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

  describe("multi-window fail-fast", () => {
    it("stops at first blocked window even if longer window would allow", async () => {
      const tightWindow: WindowConfig = { policyName: "tight", windowSec: 2, maxRequests: 1 };
      const looseWindow: WindowConfig = { policyName: "loose", windowSec: 10, maxRequests: 100 };
      const adapter = new RateLimiterMemoryAdapter(makeNoopInstrumentation());
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
      const adapter = new RateLimiterMemoryAdapter(makeNoopInstrumentation());
      const key = "ip-lowest";

      const result = await adapter.consume(key, [windowA, windowB]);

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
      const adapter = new RateLimiterMemoryAdapter(makeNoopInstrumentation());
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

      const adapter = new RateLimiterMemoryAdapter(instrumentation);

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
      const adapter = new RateLimiterMemoryAdapter(makeNoopInstrumentation());
      const key = "ip-reset";

      await adapter.consume(key, [window]);
      const result = await adapter.consume(key, [window]);

      expect(result.isSuccess).toBe(true);
      const v = result.getValue();
      expect(v.allowed).toBe(false);
      expect(v.resetSeconds).toBeGreaterThan(0);
      expect(v.resetSeconds).toBeLessThanOrEqual(60);
    });
  });
});
