import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from "bun:test";
import * as realDns from "node:dns/promises";

// Mock node:dns/promises, scoped to this file's module registry.
const mockResolveMx = mock(
  async (_domain: string) => [] as { exchange: string; priority: number }[],
);

mock.module("node:dns/promises", () => ({ ...realDns, resolveMx: mockResolveMx }));

// Import after mocking to capture mocked module
const { DisposableEmailService } = await import("../disposable-email.service");
const { NoOpInstrumentation } = await import("../noop-instrumentation");

describe("DisposableEmailService", () => {
  beforeEach(() => {
    mockResolveMx.mockReset();
  });

  afterEach(() => {
    mockResolveMx.mockReset();
  });

  it("returns ok(true) when the domain is in the bundled list", async () => {
    // mailinator.com is a well-known disposable domain in the list
    const svc = new DisposableEmailService(new NoOpInstrumentation());
    const result = await svc.isDisposable("user@mailinator.com");
    expect(result.isSuccess).toBe(true);
    expect(result.getValue()).toBe(true);
    // No DNS needed when the domain is in the static list
    expect(mockResolveMx).not.toHaveBeenCalled();
  });

  it("returns ok(false) for a legitimate domain with MX records", async () => {
    mockResolveMx.mockImplementation(async () => [{ exchange: "mail.gmail.com", priority: 10 }]);
    const svc = new DisposableEmailService(new NoOpInstrumentation());
    const result = await svc.isDisposable("user@gmail.com");
    expect(result.isSuccess).toBe(true);
    expect(result.getValue()).toBe(false);
  });

  it("returns ok(true) when the MX lookup returns no record", async () => {
    mockResolveMx.mockImplementation(async () => []);
    const svc = new DisposableEmailService(new NoOpInstrumentation());
    const result = await svc.isDisposable("user@no-mx-domain.example");
    expect(result.isSuccess).toBe(true);
    expect(result.getValue()).toBe(true);
  });

  it("returns ok(true) when resolveMx throws ENOTFOUND", async () => {
    mockResolveMx.mockImplementation(async () => {
      const err = Object.assign(new Error("getaddrinfo ENOTFOUND no-mx-domain.example"), {
        code: "ENOTFOUND",
      });
      throw err;
    });
    const svc = new DisposableEmailService(new NoOpInstrumentation());
    const result = await svc.isDisposable("user@no-mx-domain.example");
    expect(result.isSuccess).toBe(true);
    expect(result.getValue()).toBe(true);
  });

  it("returns ok(true) when resolveMx throws ENODATA (domain without MX)", async () => {
    mockResolveMx.mockImplementation(async () => {
      const err = Object.assign(new Error("queryMx ENODATA"), { code: "ENODATA" });
      throw err;
    });
    const svc = new DisposableEmailService(new NoOpInstrumentation());
    const result = await svc.isDisposable("user@no-mx-domain.example");
    expect(result.isSuccess).toBe(true);
    expect(result.getValue()).toBe(true);
  });

  it("returns fail and captures on a DNS timeout (any other error)", async () => {
    mockResolveMx.mockImplementation(async () => {
      throw new Error("queryMx ETIMEOUT");
    });
    const instrumentation = new NoOpInstrumentation();
    const captureSpy = spyOn(instrumentation, "capture");

    const svc = new DisposableEmailService(instrumentation);
    const result = await svc.isDisposable("user@legit-domain.example");

    expect(result.isFailure).toBe(true);
    expect(result.getError().code).toBe("DISPOSABLE_CHECK_FAILURE");
    expect(captureSpy).toHaveBeenCalledTimes(1);
  });

  it("returns ok(false) without I/O for an email without '@'", async () => {
    const svc = new DisposableEmailService(new NoOpInstrumentation());
    const result = await svc.isDisposable("notanemail");
    expect(result.isSuccess).toBe(true);
    expect(result.getValue()).toBe(false);
    expect(mockResolveMx).not.toHaveBeenCalled();
  });
});
