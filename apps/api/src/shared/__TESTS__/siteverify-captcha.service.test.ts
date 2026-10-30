import { describe, expect, it, mock } from "bun:test";
import { mockInstrumentation } from "../../__TESTS__/mock-instrumentation";
import { SiteverifyCaptchaService } from "../services/siteverify-captcha.service";

const VERIFY_URL = "https://captcha.example/siteverify";

function makeService(respond: () => Promise<Response>) {
  const instrumentation = mockInstrumentation();
  const fetchImpl = mock(respond);
  const service = new SiteverifyCaptchaService(
    instrumentation,
    { secretKey: "secret", verifyUrl: VERIFY_URL, timeoutMs: 1000 },
    Object.assign(fetchImpl, { preconnect: fetch.preconnect }),
  );

  return { service, instrumentation, fetchImpl };
}

const json =
  (body: unknown, status = 200) =>
  async () =>
    new Response(JSON.stringify(body), { status });

describe("SiteverifyCaptchaService", () => {
  it("given a valid token, when verified, then it posts to the configured url and accepts", async () => {
    const { service, fetchImpl } = makeService(json({ success: true }));

    const result = await service.verify("token", "203.0.113.1");

    expect(result.getValue()).toBe(true);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(VERIFY_URL);
    expect(String(init.body)).toBe("secret=secret&response=token&remoteip=203.0.113.1");
  });

  it("given a forged token, when verified, then it refuses without reporting", async () => {
    const { service, instrumentation } = makeService(
      json({ success: false, "error-codes": ["invalid-input-response"] }),
    );

    const result = await service.verify("forged", "203.0.113.1");

    expect(result.getValue()).toBe(false);
    expect(instrumentation.capture).not.toHaveBeenCalled();
  });

  it("given a forged token answered with a 4xx, when verified, then it is refused, never failed open", async () => {
    const { service } = makeService(
      json({ success: false, "error-codes": ["invalid-input-response"] }, 400),
    );

    expect((await service.verify("forged", "203.0.113.1")).getValue()).toBe(false);
  });

  it("given an oversized token, when verified, then it is refused without a network call", async () => {
    const { service, fetchImpl } = makeService(json({ success: true }));

    expect((await service.verify("a".repeat(2049), "203.0.113.1")).getValue()).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it.each([
    ["a network failure", () => Promise.reject(new Error("connection refused"))],
    ["a 5xx", json({}, 503)],
    ["an unreadable answer", async () => new Response("<html>")],
    ["a rejected secret", json({ success: false, "error-codes": ["invalid-input-secret"] })],
  ])(
    "given %s, when verified, then it returns a typed failure and captures it",
    async (_name, respond) => {
      const { service, instrumentation } = makeService(respond);

      const result = await service.verify("token", "203.0.113.1");

      expect(result.isFailure).toBe(true);
      expect(result.getError().code).toBe("CAPTCHA_PROVIDER_FAILURE");
      expect(instrumentation.capture).toHaveBeenCalledTimes(1);
    },
  );
});
