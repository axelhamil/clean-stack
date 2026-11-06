const API_MODULES = "^apps/api/src/modules";
const MODULES = "^modules";
const LIBS = "^packages/";
const TESTS = "(\\.test\\.tsx?$|/__TESTS__/|/__tests__/)";
const FRAMEWORKS =
  "node_modules/(hono|hono-pino|@hono/[^/]+|drizzle-orm|pg|better-auth|@aws-sdk|resend|stripe|@sentry)(/|$)";

module.exports = {
  forbidden: [
    {
      name: "no-cross-module-import-in-api",
      comment:
        "A module never imports another one: share through domain events, shared/ports or shared/services, the container wires it.",
      severity: "error",
      from: { path: `${API_MODULES}/([^/]+)/`, pathNot: TESTS },
      to: { path: `${API_MODULES}/([^/]+)/`, pathNot: `${API_MODULES}/$1/` },
    },
    {
      name: "pure-domain-and-application",
      comment: "Domain and application import no framework, no database and no infrastructure.",
      severity: "error",
      from: { path: `${API_MODULES}/[^/]+/(domain|application)/`, pathNot: TESTS },
      to: { path: [`${API_MODULES}/[^/]+/infrastructure/`, "^packages/drizzle/", FRAMEWORKS] },
    },
    {
      name: "domain-imports-only-the-kernel",
      comment:
        "A domain stays portable: it reaches only the DDD kit, the event catalog, zod and its own module.",
      severity: "error",
      from: { path: `${API_MODULES}/([^/]+)/domain/`, pathNot: TESTS },
      to: {
        pathNot: [
          `${API_MODULES}/$1/`,
          "^packages/(ddd-kit|events)/",
          "node_modules/(@packages/(ddd-kit|events)|zod)/",
        ],
      },
    },
    {
      name: "domain-does-not-depend-on-application",
      comment: "Layers import inwards: application depends on domain, never the other way.",
      severity: "error",
      from: { path: `${API_MODULES}/[^/]+/domain/` },
      to: { path: `${API_MODULES}/[^/]+/application/` },
    },
    {
      name: "no-cross-module-import",
      comment:
        "A business module never reaches into another one: it declares the port it needs and the host binds it.",
      severity: "error",
      from: { path: `${MODULES}/([^/]+)/src/`, pathNot: "(/__TESTS__/|/src/testing/)" },
      to: { path: `${MODULES}/([^/]+)/`, pathNot: `${MODULES}/$1/` },
    },
    {
      name: "tests-reach-other-modules-schemas-only",
      comment:
        "A test may seed another module's tables through its schemas, never reach its code: the fixture would couple both modules.",
      severity: "error",
      from: { path: `${MODULES}/([^/]+)/src/(testing/|__TESTS__/)` },
      to: {
        path: `${MODULES}/([^/]+)/`,
        pathNot: [`${MODULES}/$1/`, `${MODULES}/[^/]+/schemas/`],
      },
    },
    {
      name: "schemas-reach-only-other-schemas",
      comment:
        "A table may reference another module's table for a foreign key, never its code: the schema stays loadable by the migration tool alone.",
      severity: "error",
      from: { path: `${MODULES}/([^/]+)/schemas/` },
      to: {
        path: `${MODULES}/([^/]+)/`,
        pathNot: [`${MODULES}/$1/`, `${MODULES}/[^/]+/schemas/`],
      },
    },
    {
      name: "only-hosts-compose-modules",
      comment:
        "A module file is a composition unit: only an app wires it, otherwise its prerequisites leak into the importer.",
      severity: "error",
      from: { path: [`${MODULES}/`, LIBS] },
      to: { path: "\\.module\\.ts$" },
    },
    {
      name: "packages-stay-business-free",
      comment: "packages/ is the technical kit: it never reaches business code or an app.",
      severity: "error",
      from: { path: LIBS },
      to: { path: [`${MODULES}/`, "^apps/"] },
    },
    {
      name: "modules-never-import-apps",
      comment: "A module receives what the host owns as prerequisites, it never imports the host.",
      severity: "error",
      from: { path: `${MODULES}/` },
      to: { path: "^apps/" },
    },
    {
      name: "fronts-never-import-modules",
      comment: "apps/app and apps/admin reach business code only through the api client types.",
      severity: "error",
      from: { path: "^apps/(app|admin)/" },
      to: { path: `${MODULES}/` },
    },
    {
      name: "pure-module-domain-and-application",
      comment:
        "A module's domain and application import no framework, no database and no infrastructure.",
      severity: "error",
      from: { path: `${MODULES}/[^/]+/src/(domain|application)/`, pathNot: "/__TESTS__/" },
      to: {
        path: [
          `${MODULES}/[^/]+/src/infrastructure/`,
          `${MODULES}/[^/]+/schemas/`,
          "^packages/drizzle/",
          FRAMEWORKS,
        ],
      },
    },
    {
      name: "host-reads-modules-through-public-layers",
      comment:
        "A host query joining several modules reads their tables and ports only, never their services or stores.",
      severity: "error",
      from: { path: "^apps/api/src/queries/" },
      to: { path: `${MODULES}/`, pathNot: `${MODULES}/[^/]+/(schemas|src/application/ports)/` },
    },
    {
      name: "no-circular",
      comment:
        "A cycle between modules or packages makes their load order, and so their behaviour, accidental.",
      severity: "error",
      from: { path: [`${MODULES}/`, LIBS] },
      to: { circular: true, viaOnly: { dependencyTypesNot: ["type-only"] } },
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
    exclude: { path: "^(apps|packages|modules)/[^/]+/dist/|routeTree\\.gen\\.ts" },
    tsPreCompilationDeps: true,
    combinedDependencies: true,
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "default"],
    },
  },
};
