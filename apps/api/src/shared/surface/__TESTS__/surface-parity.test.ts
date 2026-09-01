import { describe, expect, it } from "bun:test";
import { routes } from "../../../app";
import { listBackRoutes } from "../back-routes";
import { listFrontConsumers } from "../front-consumers";
import { ROUTE_MAP } from "../route-map";

describe("surface parity", () => {
  it("every live route is declared in the map, and every map entry is live", () => {
    const live = listBackRoutes();
    const declared = Object.keys(ROUTE_MAP);

    const missingInMap = live.filter((r) => !declared.includes(r));
    const staleInMap = declared.filter((r) => !live.includes(r));

    expect({ missingInMap, staleInMap }).toEqual({ missingInMap: [], staleInMap: [] });
  });

  it("no route declared UI-less is actually consumed by the front", () => {
    const consumed = new Set(listFrontConsumers().map((c) => c.route));
    const wronglyDeclared = Object.entries(ROUTE_MAP)
      .filter(([route, entry]) => "uiLess" in entry && consumed.has(route))
      .map(([route]) => route);

    expect(wronglyDeclared).toEqual([]);
  });

  it("every declared consumer file still contains a call to its route", () => {
    const consumers = listFrontConsumers();
    const broken = Object.entries(ROUTE_MAP)
      .filter(([route, entry]) => "consumer" in entry && !consumers.some((c) => c.route === route))
      .map(([route]) => route);

    expect(broken).toEqual([]);
  });

  // listBackRoutes() drops every method === "ALL" entry to keep middleware mounts (app.use(...))
  // out of the map. That filter is blind to *why* an entry is "ALL": a future real route
  // deliberately mounted with app.all(...) would vanish the same way, silently, with no test
  // ever failing — it just never shows up anywhere. The only known legitimate "ALL" route today
  // is the opaque BetterAuth mount, so this assertion pins that as the sole exception and turns
  // any other "ALL" entry into a hard failure instead of a silent gap.
  // Hono represents every `app.use(path, middleware)` mount as a method "ALL" entry, exactly
  // like a genuine `app.all(path, handler)` route would be — there is no structural field that
  // tells the two apart, only the path. `listBackRoutes` drops every ALL entry outright to keep
  // middleware mounts out of the map, which means a future *real* route deliberately declared
  // with `app.all(...)` would vanish through the same hole, silently: no test would fail, the
  // route would just never appear anywhere. This allowlist is today's exhaustive set of known
  // middleware mount paths (rate-limit/CSRF/CORS guards) — any ALL entry outside it, and outside
  // the already-excluded BetterAuth mount, is either a new middleware mount (extend the list) or
  // the exact silent gap this test exists to catch (declare it in ROUTE_MAP instead).
  const KNOWN_MIDDLEWARE_ALL_PATHS = new Set([
    "/*",
    "/csp-report",
    "/me",
    "/me/*",
    "/uploads",
    "/uploads/*",
    "/settings/*",
    "/admin/*",
    "/consents",
    "/consents/*",
    "/billing/portal",
    "/internal/*",
    "/api/v1/*",
    "/api/token-scanning/*",
  ]);

  it("has no ALL-method route besides the documented BetterAuth mount and known middleware", () => {
    const unexpectedAllRoutes = routes.routes
      .filter((r) => r.method === "ALL")
      .filter((r) => !r.path.startsWith("/api/auth"))
      .filter((r) => !KNOWN_MIDDLEWARE_ALL_PATHS.has(r.path));

    expect(unexpectedAllRoutes).toEqual([]);
  });
});
