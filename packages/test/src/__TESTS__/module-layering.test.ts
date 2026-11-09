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
  "infrastructure/http/foo.routes.ts":
    'export const createFooRoutes = () => new Hono().get("/", () => { throw new HTTPException(404); });\n',
  "__TESTS__/foo.test.ts":
    "throw new Error(process.env.X); db.transaction((tx) => tx.insert(t));\n",
};

function moduleWith(name: string, overrides: Record<string, string>): string {
  const moduleRoot = join(root, name, "src");

  for (const [file, content] of Object.entries({ ...CLEAN_MODULE, ...overrides })) {
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
      "an augmentation of the global container",
      { "foo.module.ts": 'declare module "inwire" { interface AppDeps {} }\n' },
      /no host reach: foo\.module\.ts/,
    ],
  ])("refuses %s", (name, overrides, violation) => {
    const moduleRoot = moduleWith(name.replaceAll(" ", "-"), overrides);

    expect(() => assertModuleLayering(moduleRoot)).toThrow(violation);
  });
});
