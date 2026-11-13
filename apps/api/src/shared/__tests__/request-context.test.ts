import { describe, expect, it } from "bun:test";
import { getClientIp, getRequestId, runWithRequestContext } from "../request-context";

describe("request-context", () => {
  it("returns the id set for the current context", () => {
    const seen = runWithRequestContext({ requestId: "req-1" }, () => getRequestId());
    expect(seen).toBe("req-1");
  });

  it("is undefined outside any context", () => {
    expect(getRequestId()).toBeUndefined();
  });

  it("propagates across awaited async boundaries", async () => {
    const seen = await runWithRequestContext({ requestId: "req-async" }, async () => {
      await Promise.resolve();
      return getRequestId();
    });
    expect(seen).toBe("req-async");
  });

  it("isolates concurrent contexts", async () => {
    const [a, b] = await Promise.all([
      runWithRequestContext({ requestId: "A" }, async () => {
        await Promise.resolve();
        return getRequestId();
      }),
      runWithRequestContext({ requestId: "B" }, async () => {
        await Promise.resolve();
        return getRequestId();
      }),
    ]);
    expect(a).toBe("A");
    expect(b).toBe("B");
  });

  it("resolves the client ip lazily, only when read", () => {
    let resolved = 0;
    const clientIp = () => {
      resolved += 1;
      return "198.51.100.7";
    };

    const seen = runWithRequestContext({ requestId: "req-ip", clientIp }, () => {
      expect(resolved).toBe(0);
      return getClientIp();
    });

    expect(seen).toBe("198.51.100.7");
    expect(resolved).toBe(1);
  });

  it("has no client ip outside any context", () => {
    expect(getClientIp()).toBeUndefined();
  });
});
