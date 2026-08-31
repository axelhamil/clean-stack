import { globSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { enCatalog } from "@packages/i18n";
import { describe, expect, it } from "vitest";

const SRC = resolve(__dirname, "../../..");

/**
 * `zod-error-map.ts` resolves a custom issue with `t(issue.params.i18nKey as never)`.
 * The `as never` is what lets any string through, so a typo in an `i18nKey` compiles
 * and renders the raw key to the user. This is the only part of the i18n surface
 * `tsc` cannot see, so it gets a test instead.
 */
function keyExists(path: string): boolean {
  let cur: unknown = enCatalog.errors;
  for (const seg of path.split(".")) {
    if (typeof cur !== "object" || cur === null) return false;
    cur = (cur as Record<string, unknown>)[seg];
  }
  return typeof cur === "string";
}

function sourceFiles(): string[] {
  return globSync("**/*.{ts,tsx}", { cwd: SRC }).filter((f) => !f.includes("__tests__"));
}

describe("schema i18nKey references", () => {
  it("every i18nKey literal resolves in the English errors catalog", () => {
    const unknown: string[] = [];
    for (const file of sourceFiles()) {
      const source = readFileSync(resolve(SRC, file), "utf8");
      for (const match of source.matchAll(/i18nKey:\s*"([^"]+)"/g)) {
        const key = match[1];
        if (key !== undefined && !keyExists(key)) unknown.push(`${file}: ${key}`);
      }
    }
    expect(unknown).toEqual([]);
  });

  it("finds the i18nKey call sites it is meant to guard", () => {
    // A regex that silently matches nothing would make the test above pass forever.
    const found = sourceFiles().flatMap((file) => [
      ...readFileSync(resolve(SRC, file), "utf8").matchAll(/i18nKey:\s*"([^"]+)"/g),
    ]);
    expect(found.length).toBeGreaterThanOrEqual(7);
  });
});
