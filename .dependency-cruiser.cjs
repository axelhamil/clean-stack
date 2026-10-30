const MODULES = "^apps/api/src/modules";
const TESTS = "(\\.test\\.tsx?$|/__TESTS__/|/__tests__/)";
const FRAMEWORKS =
  "node_modules/(hono|hono-pino|@hono/[^/]+|drizzle-orm|pg|better-auth|@aws-sdk|resend|stripe|@sentry)(/|$)";

module.exports = {
  forbidden: [
    {
      name: "no-cross-module-import",
      comment:
        "A module never imports another one: share through domain events, shared/ports or shared/services, the container wires it.",
      severity: "error",
      from: { path: `${MODULES}/([^/]+)/`, pathNot: TESTS },
      to: { path: `${MODULES}/([^/]+)/`, pathNot: `${MODULES}/$1/` },
    },
    {
      name: "pure-domain-and-application",
      comment: "Domain and application import no framework, no database and no infrastructure.",
      severity: "error",
      from: { path: `${MODULES}/[^/]+/(domain|application)/`, pathNot: TESTS },
      to: { path: [`${MODULES}/[^/]+/infrastructure/`, "^packages/drizzle/", FRAMEWORKS] },
    },
    {
      name: "domain-imports-only-the-kernel",
      comment:
        "A domain stays portable: it reaches only the DDD kit, the event catalog, zod and its own module.",
      severity: "error",
      from: { path: `${MODULES}/([^/]+)/domain/`, pathNot: TESTS },
      to: {
        pathNot: [
          `${MODULES}/$1/`,
          "^packages/(ddd-kit|events)/",
          "node_modules/(@packages/(ddd-kit|events)|zod)/",
        ],
      },
    },
    {
      name: "domain-does-not-depend-on-application",
      comment: "Layers import inwards: application depends on domain, never the other way.",
      severity: "error",
      from: { path: `${MODULES}/[^/]+/domain/` },
      to: { path: `${MODULES}/[^/]+/application/` },
    },
    {
      name: "packages-never-import-apps",
      comment: "An app composes packages, a package never reaches into an app.",
      severity: "error",
      from: { path: "^packages/" },
      to: { path: "^apps/" },
    },
    {
      name: "web-kit-stays-app-agnostic",
      comment:
        "What differs per app (telemetry sink, auth client, api client, router) reaches the web kit as a parameter, so a second app reuses it unchanged.",
      severity: "error",
      from: { path: "^packages/web-kit/" },
      to: {
        path: [
          "(^|node_modules/)(@sentry|better-auth|@better-auth|hono|@tanstack/react-router)(/|$)",
          "^packages/(access-control|drizzle|ddd-kit|emails|events|ui)/",
        ],
      },
    },
    {
      name: "front-never-imports-api",
      comment:
        "A front reaches the api only through the typed Hono RPC client factory (api/client), never its internals.",
      severity: "error",
      from: { path: "^apps/(app|admin)/" },
      to: { path: "^apps/api/", pathNot: "^apps/api/src/client\\.ts$" },
    },
    {
      name: "admin-never-imports-app",
      comment:
        "The back office shares through packages only: an import of the customer app would pull its session, gates and bundle onto the staff host.",
      severity: "error",
      from: { path: "^apps/admin/" },
      to: { path: "^apps/app/" },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    exclude: { path: "^(apps|packages)/[^/]+/dist/|routeTree\\.gen\\.ts" },
    tsPreCompilationDeps: true,
    combinedDependencies: true,
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "default"],
    },
  },
};
