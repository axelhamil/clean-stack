import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from "bun:test";

// Mock node:dns/promises — superset of all exports to avoid cross-test leakage (shared CLAUDE.md rule)
const mockResolveMx = mock(
  async (_domain: string) => [] as { exchange: string; priority: number }[],
);

mock.module("node:dns/promises", () => ({
  lookup: mock(async () => ({ address: "1.2.3.4", family: 4 })),
  lookupService: mock(async () => ({ hostname: "foo", service: "http" })),
  Resolver: class {},
  getDefaultResultOrder: mock(() => "ipv4first" as const),
  setDefaultResultOrder: mock(() => {}),
  setServers: mock(() => {}),
  getServers: mock(() => [] as string[]),
  resolve: mock(async () => [] as string[]),
  resolve4: mock(async () => [] as string[]),
  resolve6: mock(async () => [] as string[]),
  resolveAny: mock(async () => []),
  resolveCaa: mock(async () => []),
  resolveCname: mock(async () => [] as string[]),
  resolveMx: mockResolveMx,
  resolveNaptr: mock(async () => []),
  resolveNs: mock(async () => [] as string[]),
  resolvePtr: mock(async () => [] as string[]),
  resolveSoa: mock(async () => ({
    nsname: "",
    hostmaster: "",
    serial: 0,
    refresh: 0,
    retry: 0,
    expire: 0,
    minttl: 0,
  })),
  resolveSrv: mock(async () => []),
  resolveTlsa: mock(async () => []),
  resolveTxt: mock(async () => [] as string[][]),
  reverse: mock(async () => [] as string[]),
  NODATA: "ENODATA",
  FORMERR: "EFORMERR",
  SERVFAIL: "ESERVFAIL",
  NOTFOUND: "ENOTFOUND",
  NOTIMP: "ENOTIMP",
  REFUSED: "EREFUSED",
  BADQUERY: "EBADQUERY",
  BADNAME: "EBADNAME",
  BADFAMILY: "EBADFAMILY",
  BADRESP: "EBADRESP",
  CONNREFUSED: "ECONNREFUSED",
  TIMEOUT: "ETIMEOUT",
  EOF: "EOF",
  FILE: "EFILE",
  NOMEM: "ENOMEM",
  DESTRUCTION: "EDESTRUCTION",
  BADSTR: "EBADSTR",
  BADFLAGS: "EBADFLAGS",
  NONAME: "ENONAME",
  BADHINTS: "EBADHINTS",
  NOTINITIALIZED: "ENOTINITIALIZED",
  LOADIPHLPAPI: "ELOADIPHLPAPI",
  ADDRGETNETWORKPARAMS: "EADDRGETNETWORKPARAMS",
  CANCELLED: "ECANCELLED",
}));

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

  it("retourne ok(true) quand le domaine est dans la liste embarquée", async () => {
    // mailinator.com est un domaine jetable bien connu dans la liste
    const svc = new DisposableEmailService(new NoOpInstrumentation());
    const result = await svc.isDisposable("user@mailinator.com");
    expect(result.isSuccess).toBe(true);
    expect(result.getValue()).toBe(true);
    // Pas besoin de DNS si le domaine est dans la liste statique
    expect(mockResolveMx).not.toHaveBeenCalled();
  });

  it("retourne ok(false) quand le domaine est légitime avec MX", async () => {
    mockResolveMx.mockImplementation(async () => [{ exchange: "mail.gmail.com", priority: 10 }]);
    const svc = new DisposableEmailService(new NoOpInstrumentation());
    const result = await svc.isDisposable("user@gmail.com");
    expect(result.isSuccess).toBe(true);
    expect(result.getValue()).toBe(false);
  });

  it("retourne ok(true) quand le MX lookup retourne un tableau vide (pas de MX)", async () => {
    mockResolveMx.mockImplementation(async () => []);
    const svc = new DisposableEmailService(new NoOpInstrumentation());
    const result = await svc.isDisposable("user@no-mx-domain.example");
    expect(result.isSuccess).toBe(true);
    expect(result.getValue()).toBe(true);
  });

  it("retourne ok(true) quand resolveMx lance ENOTFOUND", async () => {
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

  it("retourne ok(true) quand resolveMx lance ENODATA (domaine sans MX)", async () => {
    mockResolveMx.mockImplementation(async () => {
      const err = Object.assign(new Error("queryMx ENODATA"), { code: "ENODATA" });
      throw err;
    });
    const svc = new DisposableEmailService(new NoOpInstrumentation());
    const result = await svc.isDisposable("user@no-mx-domain.example");
    expect(result.isSuccess).toBe(true);
    expect(result.getValue()).toBe(true);
  });

  it("retourne fail et capture quand DNS timeout (autre erreur)", async () => {
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

  it("retourne ok(false) sans I/O pour un email sans '@'", async () => {
    const svc = new DisposableEmailService(new NoOpInstrumentation());
    const result = await svc.isDisposable("notanemail");
    expect(result.isSuccess).toBe(true);
    expect(result.getValue()).toBe(false);
    expect(mockResolveMx).not.toHaveBeenCalled();
  });
});
