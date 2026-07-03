import { describe, expect, it } from "vitest";
import { throwApiError } from "./api-error";

function makeResponse(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

describe("throwApiError", () => {
  it("merges retryAfter from Retry-After header when status is 429 and body lacks retryAfter", async () => {
    const res = makeResponse(
      429,
      { error: { code: "SECURITY_RATE_LIMITED", message: "rate limited", metadata: {} } },
      { "Retry-After": "42" },
    );
    const err = await throwApiError(res, "fallback").catch((e) => e);
    expect(err.status).toBe(429);
    expect(err.metadata?.retryAfter).toBe(42);
  });

  it("does not overwrite body retryAfter when header is also present", async () => {
    const res = makeResponse(
      429,
      {
        error: {
          code: "SECURITY_RATE_LIMITED",
          message: "rate limited",
          metadata: { retryAfter: 99 },
        },
      },
      { "Retry-After": "42" },
    );
    const err = await throwApiError(res, "fallback").catch((e) => e);
    expect(err.metadata?.retryAfter).toBe(99);
  });

  it("does not crash when 429 has no Retry-After header", async () => {
    const res = makeResponse(429, {
      error: { code: "SECURITY_RATE_LIMITED", message: "rate limited" },
    });
    const err = await throwApiError(res, "fallback").catch((e) => e);
    expect(err.status).toBe(429);
    expect(err.metadata?.retryAfter).toBeUndefined();
  });

  it("does not touch metadata for non-429 responses", async () => {
    const res = makeResponse(400, {
      error: { code: "SOME_INVALID", message: "bad input", metadata: { foo: "bar" } },
    });
    const err = await throwApiError(res, "fallback").catch((e) => e);
    expect(err.status).toBe(400);
    expect(err.metadata?.retryAfter).toBeUndefined();
    expect(err.metadata?.foo).toBe("bar");
  });

  it("throws even when no JSON body", async () => {
    const res = new Response(null, {
      status: 429,
      headers: { "Retry-After": "10" },
    });
    const err = await throwApiError(res, "fallback message").catch((e) => e);
    expect(err.message).toBe("fallback message");
    expect(err.status).toBe(429);
    expect(err.metadata?.retryAfter).toBe(10);
  });

  it("HTTP-date Retry-After header is parsed to seconds from now", async () => {
    const future = new Date(Date.now() + 120_000);
    const httpDate = future.toUTCString();
    const res = makeResponse(
      429,
      { error: { code: "SECURITY_RATE_LIMITED", message: "rate limited", metadata: {} } },
      { "Retry-After": httpDate },
    );
    const err = await throwApiError(res, "fallback").catch((e) => e);
    expect(err.status).toBe(429);
    expect(err.metadata?.retryAfter).toBeGreaterThanOrEqual(118);
    expect(err.metadata?.retryAfter).toBeLessThanOrEqual(122);
  });

  it("garbage Retry-After header is ignored, no retryAfter, no crash", async () => {
    const res = makeResponse(
      429,
      { error: { code: "SECURITY_RATE_LIMITED", message: "rate limited", metadata: {} } },
      { "Retry-After": "not-a-date-or-number" },
    );
    const err = await throwApiError(res, "fallback").catch((e) => e);
    expect(err.status).toBe(429);
    expect(err.metadata?.retryAfter).toBeUndefined();
  });
});
