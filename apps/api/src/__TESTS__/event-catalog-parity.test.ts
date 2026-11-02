import { describe, expect, it } from "bun:test";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { EventTypes } from "@packages/events";
import { createSourceScan } from "@packages/test/source-scan";

const repoRoot = join(import.meta.dir, "../../../..");
const scan = createSourceScan(repoRoot);

const EVENT_TYPE_REFERENCE = /\bEventTypes\.(\w+)/g;
const SUBSCRIPTION = /\bonEvent\(\s*EventTypes\.\w+/g;
const EMIT_BY_LITERAL = /\b(?:emit\w*|addEvent)\(\s*(?:[^(),]+,\s*){0,2}"([a-z_]+(?:\.[a-z_]+)+)"/g;
const DECLARED_ON_CLASS = /\beventType\s*=\s*"([a-z_]+(?:\.[a-z_]+)+)"/g;

const sourceRoots = [
  "apps/api/src",
  ...readdirSync(join(repoRoot, "packages"))
    .map((name) => `packages/${name}/src`)
    .filter((root) => existsSync(join(repoRoot, root))),
];

const CATALOG_ROOT = "packages/events/src";

const productionFiles = sourceRoots
  .filter((root) => root !== CATALOG_ROOT)
  .flatMap((root) => scan.sourceFiles(root));

function captures(pattern: RegExp): string[] {
  return productionFiles.flatMap((file) =>
    [...scan.codeOf(file).replace(SUBSCRIPTION, "").matchAll(pattern)].map(
      (match) => match[1] ?? "",
    ),
  );
}

const catalogNames = Object.keys(EventTypes);
const catalogTypes: string[] = Object.values(EventTypes);
const referencedNames = new Set(captures(EVENT_TYPE_REFERENCE));
const emittedLiterals = [...captures(EMIT_BY_LITERAL), ...captures(DECLARED_ON_CLASS)];

describe("event catalog parity", () => {
  it("every catalog event type is referenced by production code outside the catalog", () => {
    const orphans = catalogNames.filter((name) => !referencedNames.has(name));

    expect(referencedNames.size).toBeGreaterThan(0);
    expect(orphans).toEqual([]);
  });

  it("no emit site uses a type outside the catalog", () => {
    const unknownNames = [...referencedNames].filter((name) => !catalogNames.includes(name));
    const unknownLiterals = emittedLiterals.filter((type) => !catalogTypes.includes(type));

    expect(unknownNames).toEqual([]);
    expect(unknownLiterals).toEqual([]);
  });
});
