import { routes } from "../../app";

export type RouteKey = string;

/**
 * Surfaces whose internal route table is owned by a library and not exported.
 * They are one documented row each rather than an enumeration: a wrong list is
 * worse than an honest "library-owned" marker (see spec D4).
 */
export const OPAQUE_SURFACES = ["ALL /api/auth/*"] as const;

const MIDDLEWARE_PATHS = new Set(["/*", "*"]);

export function listBackRoutes(): RouteKey[] {
  const keys = new Set<RouteKey>(OPAQUE_SURFACES);

  for (const { method, path } of routes.routes) {
    if (MIDDLEWARE_PATHS.has(path)) continue;
    if (path.startsWith("/api/auth")) continue;
    if (method === "ALL") continue;
    keys.add(`${method} ${normalize(path)}`);
  }

  return [...keys].sort();
}

/** Hono keeps a trailing slash on a sub-app mounted at "/" — "/uploads/" and
 * "/uploads" are the same route, and the front reconstructs the second form. */
function normalize(path: string): string {
  return path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
}
