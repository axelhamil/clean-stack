import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { assertModuleLayering } from "../source-scan";

const root = mkdtempSync(join(tmpdir(), "module-layering-"));

afterAll(() => rmSync(root, { recursive: true, force: true }));

const CLEAN_MODULE: Record<string, string> = {
  "foo.module.ts":
    'import { defineModule } from "inwire";\nexport const fooModule = defineModule()((b) => b);\n',
  "domain/foo.ts": "export const foo = 1;\n",
  "application/services/foo.service.ts":
    "export class FooService { run() { return Result.ok(this.store.insert(row)); } }\n",
  "infrastructure/repositories/foo.store.ts":
    "export class FooStore { save() { return resolveExecutor().insert(table).values(row); } }\n",
  "infrastructure/http/foo.routes.ts": [
    'import { zV } from "@packages/http/validator";',
    'import { totpOptions } from "../../shared/auth/totp-options";',
    'import { fooDto } from "../../application/dto/foo.dto";',
    'export const createFooRoutes = () => new Hono().get("/", () => { throw new HTTPException(404); });',
    "",
  ].join("\n"),
  "__TESTS__/foo.test.ts":
    "throw new Error(process.env.X); db.transaction((tx) => tx.insert(t));\n",
};

const TARGET_ROUTE = [
  'import { zV } from "@packages/http/validator";',
  "export const createFooRoutes = () =>",
  "  new Hono()",
  '    .get("/:id", zV("param", idParam), (c) => c.json({ id: c.req.param("id") }))',
  '    .post("/", zV("json", fooSchema), (c) => c.json(c.req.valid("json")));',
  "",
].join("\n");

const TARGET_MODULE: Record<string, string> = {
  "foo.module.ts": CLEAN_MODULE["foo.module.ts"] ?? "",
  "domain/foo/foo.aggregate.ts": "export class Foo {}\n",
  "domain/foo/events/foo-created.event.ts": "export const fooCreated = 1;\n",
  "application/config/foo-settings.ts": "export interface FooSettings {}\n",
  "application/usecases/create-foo/create-foo.usecase.ts":
    "export class CreateFooUseCase { execute() { return Result.ok(); } }\n",
  "application/event-handlers/on-foo-created.ts": [
    'import { onEvent } from "@packages/ddd-kit";',
    'import { EventTypes, PayloadByEventType } from "@packages/events";',
    'import { payloadParser } from "@packages/outbox/payload-parser";',
    'import { fooCreated } from "../../domain/foo/events/foo-created.event";',
    'import type { CreateFooUseCase } from "../usecases/create-foo/create-foo.usecase";',
    "",
  ].join("\n"),
  "infra/http/routes/foo/foo.ts": TARGET_ROUTE,
  "__tests__/foo.test.ts": 'c.req.param("id"); import { x } from "../infra/repos/foo";\n',
};

function moduleWith(
  name: string,
  overrides: Record<string, string>,
  base: Record<string, string> = CLEAN_MODULE,
): string {
  const moduleRoot = join(root, name, "src");

  for (const [file, content] of Object.entries({ ...base, ...overrides })) {
    const path = join(moduleRoot, file);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
  }

  return moduleRoot;
}

describe("assertModuleLayering", () => {
  it("accepts a module that respects every guard, tests included", () => {
    expect(() => assertModuleLayering(moduleWith("clean", {}))).not.toThrow();
  });

  it("refuses a module with no source file", () => {
    const empty = join(root, "empty", "src");
    mkdirSync(empty, { recursive: true });

    expect(() => assertModuleLayering(empty)).toThrow(/no source file/);
  });

  it.each([
    [
      "a throw in domain",
      { "domain/foo.ts": "throw new Error();\n" },
      /never throw: domain\/foo\.ts/,
    ],
    [
      "a throw in application",
      { "application/services/foo.service.ts": "throw new Error();\n" },
      /never throw: application\/services\/foo\.service\.ts/,
    ],
    [
      "a route that writes",
      { "infrastructure/http/foo.routes.ts": "db.update(table).set(row);\n" },
      /routes never write: infrastructure\/http\/foo\.routes\.ts/,
    ],
    [
      "a tx parameter",
      { "infrastructure/repositories/foo.store.ts": "export function save(tx: Tx) {}\n" },
      /no tx parameter: infrastructure\/repositories\/foo\.store\.ts/,
    ],
    [
      "a transaction opened",
      { "infrastructure/repositories/foo.store.ts": "db.transaction(async () => {});\n" },
      /no transaction opened: infrastructure\/repositories\/foo\.store\.ts/,
    ],
    [
      "an environment read",
      { "foo.module.ts": "const key = process.env.FOO_KEY;\n" },
      /no environment read: foo\.module\.ts/,
    ],
    [
      "an import of the host container",
      { "foo.module.ts": 'import { di } from "../../container";\n' },
      /no host reach: foo\.module\.ts/,
    ],
    [
      "an import of the host auth instance",
      { "domain/foo.ts": 'import { auth } from "../auth";\n' },
      /no host reach: domain\/foo\.ts/,
    ],
    [
      "an import of the host env",
      { "domain/foo.ts": 'import { env } from "../shared/env";\n' },
      /no host reach: domain\/foo\.ts/,
    ],
    [
      "an import of a host middleware",
      { "domain/foo.ts": 'import { requireAuth } from "../shared/middleware/auth";\n' },
      /no host reach: domain\/foo\.ts/,
    ],
    [
      "a relative import of the host container from modules",
      { "foo.module.ts": 'import { di } from "../../../apps/api/src/container";\n' },
      /no host reach: foo\.module\.ts/,
    ],
    [
      "a relative import of the host env from modules",
      { "domain/foo.ts": 'import { env } from "../../../../apps/api/src/shared/env";\n' },
      /no host reach: domain\/foo\.ts/,
    ],
    [
      "a dynamic import of the host container",
      { "foo.module.ts": 'const { di } = await import("../container");\n' },
      /no host reach: foo\.module\.ts/,
    ],
    [
      "an import below the host auth instance",
      { "domain/foo.ts": 'import { session } from "../../auth/session";\n' },
      /no host reach: domain\/foo\.ts/,
    ],
    [
      "a re-export of the host env with its extension",
      { "domain/foo.ts": 'export * from "../shared/env.ts";\n' },
      /no host reach: domain\/foo\.ts/,
    ],
    [
      "an import of the host composition",
      { "foo.module.ts": 'import { routeGuards } from "../../composition/route-guards";\n' },
      /no host reach: foo\.module\.ts/,
    ],
    [
      "an environment read through node:process",
      { "domain/foo.ts": 'import { env } from "node:process";\nexport const key = env.FOO_KEY;\n' },
      /no environment read: domain\/foo\.ts/,
    ],
    [
      "an environment read through process",
      { "domain/foo.ts": "import { env as vars } from 'process';\n" },
      /no environment read: domain\/foo\.ts/,
    ],
    [
      "an environment read by nested destructuring",
      { "domain/foo.ts": "export const { env: { FOO_KEY } } = process;\n" },
      /no environment read: domain\/foo\.ts/,
    ],
    [
      "a transaction opened through a computed key",
      { "infrastructure/repositories/foo.store.ts": 'db["transaction"](async () => {});\n' },
      /no transaction opened: infrastructure\/repositories\/foo\.store\.ts/,
    ],
    [
      "an augmentation of the global container",
      { "foo.module.ts": 'declare module "inwire" { interface AppDeps {} }\n' },
      /no host reach: foo\.module\.ts/,
    ],
  ])("refuses %s", (name, overrides, violation) => {
    const moduleRoot = moduleWith(name.replaceAll(" ", "-"), overrides);

    expect(() => assertModuleLayering(moduleRoot)).toThrow(violation);
  });

  it("finds a route file by its path, not only by its suffix", () => {
    const moduleRoot = moduleWith(
      "route-by-path",
      { "infra/http/routes/foo/foo.ts": "db.update(table).set(row);\n" },
      TARGET_MODULE,
    );

    expect(() => assertModuleLayering(moduleRoot)).toThrow(
      /routes never write: infra\/http\/routes\/foo\/foo\.ts/,
    );
  });

  it("keeps the shape guards off unless asked", () => {
    const legacy = moduleWith("legacy-shape", {
      "application/dto/foo.dto.ts": "export const fooDto = 1;\n",
      "testing/foo.fixture.ts": "export const fixture = 1;\n",
      "domain/value-objects/slug.vo.ts": "export class Slug {}\n",
      "infrastructure/http/foo.routes.ts": 'new Hono().get("/:id", (c) => c.req.param("id"));\n',
    });

    expect(() => assertModuleLayering(legacy)).not.toThrow();
  });

  it("accepts a target-shaped module with the shape guards on", () => {
    const moduleRoot = moduleWith("target-clean", {}, TARGET_MODULE);

    expect(() => assertModuleLayering(moduleRoot, { targetShape: true })).not.toThrow();
  });

  it("accepts the legacy spellings of the infrastructure and test folders", () => {
    const moduleRoot = moduleWith(
      "target-legacy-spellings",
      {
        "infrastructure/repositories/foo.store.ts": "export class FooStore {}\n",
        "__TESTS__/foo.test.ts": "export {};\n",
      },
      TARGET_MODULE,
    );

    expect(() => assertModuleLayering(moduleRoot, { targetShape: true })).not.toThrow();
  });

  const HANDLER = "application/event-handlers/on-foo-created.ts";
  const ROUTE = "infra/http/routes/foo/foo.ts";

  it.each([
    [
      "a folder outside the target entries at the root",
      { "testing/foo.fixture.ts": "export const fixture = 1;\n" },
      /module root holds only the target entries: testing/,
    ],
    [
      "a file outside the target entries at the root",
      { "helpers.ts": "export const helper = 1;\n" },
      /module root holds only the target entries: helpers\.ts/,
    ],
    [
      "a value-objects folder at the root of domain",
      { "domain/value-objects/slug.vo.ts": "export class Slug {}\n" },
      /no category folder at the root of domain: domain\/value-objects/,
    ],
    [
      "an events folder at the root of domain",
      { "domain/events/foo-created.event.ts": "export const e = 1;\n" },
      /no category folder at the root of domain: domain\/events/,
    ],
    [
      "an entities folder at the root of domain",
      { "domain/entities/foo.entity.ts": "export class Foo {}\n" },
      /no category folder at the root of domain: domain\/entities/,
    ],
    [
      "a global application dto folder",
      { "application/dto/foo.dto.ts": "export const fooDto = 1;\n" },
      /no application dto folder: application\/dto/,
    ],
    [
      "a raw param read with no validator",
      { [ROUTE]: 'new Hono().get("/:id", (c) => c.json(c.req.param("id")));\n' },
      /route inputs validated by zV: infra\/http\/routes\/foo\/foo\.ts/,
    ],
    [
      "a raw body text read, which no validator can cover",
      {
        [ROUTE]: 'new Hono().post("/", zV("json", s), async (c) => c.json(await c.req.text()));\n',
      },
      /route inputs validated by zV: infra\/http\/routes\/foo\/foo\.ts/,
    ],
    [
      "a raw read covered only by the validator of another route",
      {
        [ROUTE]: [
          'new Hono().get("/:id", zV("param", idParam), (c) => c.json(c.req.param("id")))',
          '  .delete("/:id", (c) => c.json(c.req.param("id")));',
          "",
        ].join("\n"),
      },
      /route inputs validated by zV: infra\/http\/routes\/foo\/foo\.ts/,
    ],
    [
      "a raw query read under a validator of another target",
      { [ROUTE]: 'new Hono().get("/", zV("json", s), (c) => c.json(c.req.query("q")));\n' },
      /route inputs validated by zV: infra\/http\/routes\/foo\/foo\.ts/,
    ],
    [
      "a raw header read in a legacy routes file",
      {
        "infrastructure/http/foo.routes.ts":
          'new Hono().post("/", (c) => c.json(c.req.header("stripe-signature")));\n',
      },
      /route inputs validated by zV: infrastructure\/http\/foo\.routes\.ts/,
    ],
    [
      "a handler importing a port",
      { [HANDLER]: 'import type { IFooRepository } from "../ports/repositories/foo.port";\n' },
      /handlers import only use cases, the event and the payload parser: application\/event-handlers\/on-foo-created\.ts/,
    ],
    [
      "a handler importing an application service",
      { [HANDLER]: 'import type { FooService } from "../services/foo.service";\n' },
      /handlers import only use cases, the event and the payload parser: application\/event-handlers/,
    ],
    [
      "a handler emitting through the outbox",
      { [HANDLER]: 'import { emitEvent } from "@packages/outbox/event-emitter";\n' },
      /handlers import only use cases, the event and the payload parser: application\/event-handlers/,
    ],
    [
      "a handler importing a port through a template literal",
      { [HANDLER]: "const port = await import(`../ports/repositories/foo.port`);\n" },
      /handlers import only use cases, the event and the payload parser: application\/event-handlers/,
    ],
    [
      "a handler importing an event file of the infrastructure",
      { [HANDLER]: 'import { drizzle } from "../../infra/adapters/drizzle.event";\n' },
      /handlers import only use cases, the event and the payload parser: application\/event-handlers/,
    ],
    [
      "a handler importing a usecases folder of the infrastructure",
      { [HANDLER]: 'import { db } from "../../infra/usecases/db";\n' },
      /handlers import only use cases, the event and the payload parser: application\/event-handlers/,
    ],
  ])("refuses %s when the shape guards are on", (name, overrides, violation) => {
    const moduleRoot = moduleWith(`target-${slug(name)}`, overrides, TARGET_MODULE);

    expect(() => assertModuleLayering(moduleRoot, { targetShape: true })).toThrow(violation);
  });

  const UNVALIDATED = /route inputs validated by zV: /;

  function route(...lines: string[]): Record<string, string> {
    return { [ROUTE]: [...lines, ""].join("\n") };
  }

  it.each([
    ["a multi-value query read", route('new Hono().get("/", (c) => c.json(c.req.queries("q")));')],
    [
      "a parsed body read",
      route('new Hono().post("/", async (c) => c.json(await c.req.parseBody()));'),
    ],
    [
      "a form data read",
      route('new Hono().post("/", async (c) => c.json(await c.req.formData()));'),
    ],
    [
      "an array buffer read",
      route('new Hono().post("/", async (c) => c.json(await c.req.arrayBuffer()));'),
    ],
    ["a blob read", route('new Hono().post("/", async (c) => c.json(await c.req.blob()));')],
    [
      "a read through the raw request",
      route('new Hono().post("/", zV("json", s), async (c) => c.json(await c.req.raw.json()));'),
    ],
    [
      "a destructured request",
      route(
        'new Hono().get("/:id", (c) => { const { req } = c; return c.json(req.param("id")); });',
      ),
    ],
    [
      "a request destructured in the handler parameters",
      route('new Hono().get("/:id", ({ req, json }) => json(req.param("id")));'),
    ],
    [
      "an aliased request",
      route('new Hono().get("/:id", (c) => { const r = c.req; return c.json(r.param("id")); });'),
    ],
    [
      "an element access read",
      route('new Hono().get("/:id", (c) => c.json(c.req["param"]("id")));'),
    ],
    [
      "a read with a type argument",
      route('new Hono().get("/:id", (c) => c.json(c.req.param<"id">("id")));'),
    ],
    [
      "a read with a space before the call",
      route('new Hono().get("/:id", (c) => c.json(c.req.param ("id")));'),
    ],
    [
      "an optional chained read",
      route('new Hono().get("/:id", (c) => c.json(c.req?.param("id")));'),
    ],
    [
      "a read split over two lines",
      route('new Hono().get("/:id", (c) => c.json(c.req', '  .param("id")));'),
    ],
    ["a cookie helper read", route('new Hono().get("/", (c) => c.json(getCookie(c, "sid")));')],
    [
      "a read in a wildcard route after a validated one",
      route(
        'new Hono().get("/:id", zV("param", s), (c) => c.json(c.req.valid("param")))',
        '  .get("*", (c) => c.json(c.req.param("id")));',
      ),
    ],
    [
      "a read in an on registration after a validated one",
      route(
        'new Hono().get("/:id", zV("param", s), (c) => c.json(c.req.valid("param")))',
        '  .on(["GET"], "/b/:id", (c) => c.json(c.req.param("id")));',
      ),
    ],
    [
      "a read in a route registered by a constant path after a validated one",
      route(
        'new Hono().get("/:id", zV("param", s), (c) => c.json(c.req.valid("param")))',
        '  .get(PATH, (c) => c.json(c.req.param("id")));',
      ),
    ],
    [
      "a read in a middleware after a validated route",
      route(
        'new Hono().get("/:id", zV("param", s), (c) => c.json(c.req.valid("param")))',
        '  .use(async (c, next) => { c.req.param("id"); await next(); });',
      ),
    ],
    [
      "a validator named only inside a string",
      route(
        'new Hono().get("/:id", (c) => c.json({ hint: \'zV("param"\', id: c.req.param("id") }));',
      ),
    ],
    [
      "a raw body read whose opt-out gives no reason",
      route(
        'new Hono().post("/hook", async (c) => {',
        "  // raw-body:",
        "  return c.json(await c.req.text());",
        "});",
      ),
    ],
    [
      "a raw read in an http controller",
      {
        "infra/http/controllers/foo.ts": 'export const read = (c) => c.req.param("id");\n',
      },
    ],
    [
      "a raw read in a singular route file",
      { "infra/http/foo.route.ts": 'new Hono().get("/:id", (c) => c.json(c.req.param("id")));\n' },
    ],
  ])("refuses %s when the shape guards are on", (name, overrides) => {
    const moduleRoot = moduleWith(`target-read-${slug(name)}`, overrides, TARGET_MODULE);

    expect(() => assertModuleLayering(moduleRoot, { targetShape: true })).toThrow(UNVALIDATED);
  });

  it.each([
    [
      "a hoisted validator",
      route(
        'const byId = zV("param", idParam);',
        'new Hono().get("/:id", byId, (c) => c.json(c.req.param("id")));',
      ),
    ],
    [
      "a hoisted handler mounted behind its validator",
      route(
        'const read = (c) => c.json(c.req.param("id"));',
        'new Hono().get("/:id", zV("param", idParam), read);',
      ),
    ],
    [
      "a get call inside a validated handler",
      route(
        'new Hono().get("/:id", zV("param", s), async (c) => {',
        '  const users = await api.get("/users");',
        '  return c.json({ users, id: c.req.param("id") });',
        "});",
      ),
    ],
    [
      "an aliased validator",
      route(
        'import { zV as validate } from "@packages/http/validator";',
        'new Hono().get("/:id", validate("param", s), (c) => c.json(c.req.param("id")));',
      ),
    ],
    [
      "a validator with a type argument",
      route('new Hono().get("/:id", zV<"param">("param", s), (c) => c.json(c.req.param("id")));'),
    ],
    [
      "a raw body read with its opt-out and reason",
      route(
        'new Hono().post("/hook", async (c) => {',
        "  // raw-body: the signature is computed over the exact bytes",
        "  return c.json(await c.req.text());",
        "});",
      ),
    ],
    [
      "dotfiles and type declarations at the root",
      { ".DS_Store": "", "env.d.ts": "declare const X: string;\n" },
    ],
  ])("accepts %s when the shape guards are on", (name, overrides) => {
    const moduleRoot = moduleWith(`target-ok-${slug(name)}`, overrides, TARGET_MODULE);

    expect(() => assertModuleLayering(moduleRoot, { targetShape: true })).not.toThrow();
  });
});

function slug(name: string): string {
  return name.replace(/[^a-z0-9]+/gi, "-");
}
