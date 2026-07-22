import { describe, expect, it, mock, spyOn } from "bun:test";
import { CryptoHasher } from "bun";

const { HibpPasswordBreachService } = await import("../hibp-password-breach.service");
const { NoOpInstrumentation } = await import("../noop-instrumentation");

const PASSWORD = "supersecretpassword";
// SHA-1("supersecretpassword") uppercase — computed at module load to verify URL construction
const HASH = new CryptoHasher("sha1").update(PASSWORD).digest("hex").toUpperCase();
const PREFIX = HASH.slice(0, 5);
const SUFFIX = HASH.slice(5);

describe("HibpPasswordBreachService", () => {
  it("retourne isBreached=true quand le suffix est présent dans la réponse", async () => {
    const mockFetch = mock(async (url: string) => {
      expect(url).toBe(`https://api.pwnedpasswords.com/range/${PREFIX}`);
      expect(url).not.toContain(SUFFIX);
      return new Response(`AAABB:3\r\n${SUFFIX}:42\r\nCCCDD:1`, { status: 200 });
    });

    const svc = new HibpPasswordBreachService(
      new NoOpInstrumentation(),
      mockFetch as unknown as typeof fetch,
    );
    const result = await svc.isBreached(PASSWORD);
    expect(result.isSuccess).toBe(true);
    expect(result.getValue()).toBe(true);
  });

  it("retourne isBreached=false quand le suffix est absent", async () => {
    const mockFetch = mock(async (_url: string) => {
      return new Response("AAABB:3\r\nCCCDD:1", { status: 200 });
    });

    const svc = new HibpPasswordBreachService(
      new NoOpInstrumentation(),
      mockFetch as unknown as typeof fetch,
    );
    const result = await svc.isBreached(PASSWORD);
    expect(result.isSuccess).toBe(true);
    expect(result.getValue()).toBe(false);
  });

  it("ne transmet jamais le password complet dans l'URL (seulement le prefix 5 chars)", async () => {
    let capturedUrl = "";
    const mockFetch = mock(async (url: string) => {
      capturedUrl = url as string;
      return new Response("", { status: 200 });
    });

    const svc = new HibpPasswordBreachService(
      new NoOpInstrumentation(),
      mockFetch as unknown as typeof fetch,
    );
    await svc.isBreached(PASSWORD);

    expect(capturedUrl).toContain(PREFIX);
    expect(capturedUrl).not.toContain(PASSWORD);
    expect(capturedUrl).not.toContain(SUFFIX);
    expect(capturedUrl).toMatch(/\/range\/[A-F0-9]{5}$/);
  });

  it("retourne Result.fail quand fetch lève une erreur réseau", async () => {
    const mockFetch = mock(async (_url: string) => {
      throw new Error("network timeout");
    });

    const instrumentation = new NoOpInstrumentation();
    const captureSpy = spyOn(instrumentation, "capture");

    const svc = new HibpPasswordBreachService(
      instrumentation,
      mockFetch as unknown as typeof fetch,
    );
    const result = await svc.isBreached(PASSWORD);

    expect(result.isFailure).toBe(true);
    expect(result.getError().code).toBe("BREACH_CHECK_PROVIDER_FAILURE");
    expect(captureSpy).toHaveBeenCalledTimes(1);
  });

  it("retourne Result.fail et capture quand la réponse n'est pas ok", async () => {
    const mockFetch = mock(async (_url: string) => {
      return new Response("Too Many Requests", { status: 429 });
    });

    const instrumentation = new NoOpInstrumentation();
    const captureSpy = spyOn(instrumentation, "capture");

    const svc = new HibpPasswordBreachService(
      instrumentation,
      mockFetch as unknown as typeof fetch,
    );
    const result = await svc.isBreached(PASSWORD);

    expect(result.isFailure).toBe(true);
    expect(result.getError().code).toBe("BREACH_CHECK_PROVIDER_FAILURE");
    expect(captureSpy).toHaveBeenCalledTimes(1);
  });
});
