import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { createSourceScan } from "../source-scan";

/* biome-ignore lint/suspicious/noTemplateCurlyInString: the fixture is source text holding a template literal */
const TEMPLATE_SOURCE = "const tpl = `a ${b ? '//' : `/*${c}*/`} d`;";

const root = mkdtempSync(join(tmpdir(), "source-scan-"));

afterAll(() => rmSync(root, { recursive: true, force: true }));

function fixture(layer: string, files: Record<string, string>): void {
  for (const [name, content] of Object.entries(files)) {
    const path = join(root, layer, name);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
  }
}

describe("createSourceScan", () => {
  it("sourceFiles skips test files and test directories", () => {
    fixture("files", {
      "a.ts": "",
      "a.test.ts": "",
      "__TESTS__/helper.ts": "",
      "nested/__tests__/helper.ts": "",
      "nested/b.ts": "",
    });

    const files = createSourceScan(root).sourceFiles("files");

    expect(files).toEqual(["files/a.ts", "files/nested/b.ts"]);
  });

  it("codeOf keeps comment markers that live inside strings", () => {
    fixture("strings", {
      "a.ts": [
        'const q = "/*"; db.insert(t); const q2 = "*/";',
        'const glob = "src/**/*.ts";',
        "const url = 'https://example.com';",
        TEMPLATE_SOURCE,
      ].join("\n"),
    });

    const code = createSourceScan(root).codeOf("strings/a.ts");

    expect(code).toContain("db.insert(t)");
    expect(code).toContain('"src/**/*.ts"');
    expect(code).toContain("'https://example.com'");
    expect(code).toContain(TEMPLATE_SOURCE);
  });

  it("codeOf drops trailing line comments and block comments", () => {
    fixture("comments", {
      "a.ts": "foo(); // emitEvent(outbox, EventTypes.X)\nbar(/* EventTypes.Y */);\n",
    });

    const code = createSourceScan(root).codeOf("comments/a.ts");

    expect(code).not.toContain("EventTypes");
    expect(code).toContain("foo();");
    expect(code).toContain("bar();");
  });

  it("throwsPerFile counts throw statements outside comments and strings", () => {
    fixture("throws", {
      "two.ts": 'throw new Error("a");\nif (x) throw y;\n// throw z;\n',
      "none.ts": '/* throw nothing */\nconst thrown = 1;\nlog("throw in string");\n',
    });

    const throws = createSourceScan(root).throwsPerFile("throws");

    expect(throws).toEqual({ "throws/two.ts": 2 });
  });

  it("writeCallsPerFile counts insert/update/delete calls but not Map.delete on a string key", () => {
    fixture("writes", {
      "repo.ts":
        "await db.update(userTable).set(x);\ntx.delete(sessionTable);\ndb\n  .insert(\n    linkTable);\n",
      "cache.ts": 'cache.delete("key");\napp.delete(\n  "/:id", handler);\n',
    });

    const writes = createSourceScan(root).writeCallsPerFile("writes");

    expect(writes).toEqual({ "writes/repo.ts": 3 });
  });

  it("envReadsPerFile counts every way to reach the environment", () => {
    fixture("env", {
      "config.ts":
        "const a = process.env.A;\nconst { B } = process.env;\nconst c = Bun.env.C;\n// process.env.D\n",
      "optional.ts": "const a = process?.env.A;\n",
      "bracket.ts": "const a = process[\"env\"].A;\nconst b = process['env'].B;\n",
      "meta.ts": "const a = import.meta.env.A;\n",
      "destructured.ts": "const { env } = process;\nconst { env: e, argv } = process\n",
      "clean.ts": 'const environment = "prod";\nlog("process.env.X");\n',
    });

    const reads = createSourceScan(root).envReadsPerFile("env");

    expect(reads).toEqual({
      "env/bracket.ts": 2,
      "env/config.ts": 3,
      "env/destructured.ts": 2,
      "env/meta.ts": 1,
      "env/optional.ts": 1,
    });
  });
});
