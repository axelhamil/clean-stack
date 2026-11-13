const MODULES = "^modules";
const LIBS = "^packages/";
const MODULE_SRC = `${MODULES}/[^/]+/src/`;
const ANY_SCHEMAS = `${MODULES}/[^/]+/schemas/`;
const DB_KIT = "^packages/drizzle/";
const ORM_PACKAGES = "drizzle-orm|pg";
const ORM = `(^|node_modules/)(${ORM_PACKAGES})(/|$)`;
const FRAMEWORKS = `node_modules/(hono|hono-pino|@hono/[^/]+|${ORM_PACKAGES}|better-auth|@aws-sdk|resend|stripe|@sentry)(/|$)`;
const INFRA = "(?:infrastructure|infra)";
const TESTS = "(?:__TESTS__|__tests__|testing)";
const TEST_PATH = `/${TESTS}/`;
const MIGRATED_MODULES = [
  "uploads",
  "api-token",
  "profile",
  "policies",
  "consents",
  "billing",
  "quotas",
  "audit-log",
  "notifications",
  "webhooks",
  "admin",
  "rgpd",
];
const MIGRATED =
  MIGRATED_MODULES.length > 0 ? `${MODULES}/(${MIGRATED_MODULES.join("|")})/src/` : "^$";

module.exports = {
  forbidden: [
    {
      name: "no-cross-module-import",
      comment:
        "A business module never reaches into another one: it declares the port it needs and the host binds it.",
      severity: "error",
      from: { path: `${MODULES}/([^/]+)/src/`, pathNot: TEST_PATH },
      to: { path: `${MODULES}/([^/]+)/`, pathNot: `${MODULES}/$1/` },
    },
    {
      name: "tests-reach-other-modules-schemas-only",
      comment:
        "A test may seed another module's tables through its schemas, never reach its code: the fixture would couple both modules.",
      severity: "error",
      from: { path: `${MODULES}/([^/]+)/src/${TESTS}/` },
      to: {
        path: `${MODULES}/([^/]+)/`,
        pathNot: [`${MODULES}/$1/`, ANY_SCHEMAS],
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
        pathNot: [`${MODULES}/$1/`, ANY_SCHEMAS],
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
      from: { path: `${MODULE_SRC}(domain|application)/`, pathNot: TEST_PATH },
      to: {
        path: [`${MODULE_SRC}${INFRA}/`, ANY_SCHEMAS, DB_KIT, FRAMEWORKS],
      },
    },
    {
      name: "layered-domain-imports-only-domain",
      comment:
        "In a migrated module the domain depends on no other layer: an import of application or infra makes the rules depend on how they are used or stored.",
      severity: "error",
      from: { path: `${MIGRATED}domain/`, pathNot: TEST_PATH },
      to: { path: `${MODULES}/$1/src/`, pathNot: `${MODULES}/$1/src/domain/` },
    },
    {
      name: "layered-routes-read-through-ports",
      comment:
        "In a migrated module a route reaches data only through a use case or a query port: a repository, an adapter, a technical service or the ORM imported by a route bypasses the port that keeps the read testable and scoped.",
      severity: "error",
      from: { path: `${MIGRATED}${INFRA}/http/`, pathNot: TEST_PATH },
      to: {
        path: [`${MODULES}/$1/src/${INFRA}/`, `${MODULES}/$1/schemas/`, DB_KIT, ORM],
        pathNot: `${MODULES}/$1/src/${INFRA}/http/`,
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
