import { describe, expect, it, mock } from "bun:test";

const realRateLimit = await import("../shared/middleware/rate-limit.middleware");
mock.module("../shared/middleware/rate-limit.middleware", () => ({
  ...realRateLimit,
  requireRateLimit: () => (_c: unknown, next: () => Promise<void>) => next(),
}));

const realIp = await import("../shared/middleware/rate-limit.ip");
mock.module("../shared/middleware/rate-limit.ip", () => ({
  ...realIp,
  resolveClientIp: () => "198.51.100.7",
}));

const realEmitter = await import("../shared/event-emitter");
mock.module("../shared/event-emitter", () => ({
  ...realEmitter,
  emitEventBestEffort: async () => undefined,
}));

const { app, routes } = await import("../app");

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS", "ALL"]);

const NOT_COOKIE_AUTHENTICATED = ["/internal/", "/api/v1/", "/api/token-scanning/", "/api/auth/"];
const PUBLIC_WITHOUT_CREDENTIAL = ["/csp-report"];

function isCookieAuthenticated(path: string): boolean {
  if (PUBLIC_WITHOUT_CREDENTIAL.includes(path)) return false;

  return !NOT_COOKIE_AUTHENTICATED.some((prefix) => path.startsWith(prefix));
}

const mutatingRoutes = [
  ...new Set(
    routes.routes
      .filter(({ method, path }) => !SAFE_METHODS.has(method) && isCookieAuthenticated(path))
      .map(({ method, path }) => `${method} ${path.replace(/:[^/]+/g, "x")}`),
  ),
].map((route) => {
  const [method = "", path = ""] = route.split(" ");

  return { method, path };
});

describe("CSRF coverage of the live route table", () => {
  it("finds the cookie-authenticated mutating routes", () => {
    expect(mutatingRoutes.map(({ path }) => path)).toContain("/notifications/read-all");
  });

  it("refuses a foreign Origin on every cookie-authenticated mutating route", async () => {
    const unguarded: string[] = [];

    for (const { method, path } of mutatingRoutes) {
      const res = await app.request(path, {
        method,
        headers: { origin: "https://evil.example", "content-type": "application/json" },
        body: "{}",
      });
      const body = await res.text();
      if (!body.includes("SECURITY_CSRF_FORBIDDEN")) unguarded.push(`${method} ${path}`);
    }

    expect(unguarded).toEqual([]);
  });
});
