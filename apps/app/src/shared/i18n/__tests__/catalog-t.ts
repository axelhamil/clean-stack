import type { TFunction } from "i18next";

/**
 * Walks a catalog namespace along a dotted key. `undefined` when the path does
 * not end on a string, which is what a missing or mistyped key looks like.
 */
export function catalogLookup(namespace: unknown, key: string): string | undefined {
  let node = namespace;
  for (const segment of key.split(".")) {
    if (typeof node !== "object" || node === null) return undefined;
    node = (node as Record<string, unknown>)[segment];
  }

  return typeof node === "string" ? node : undefined;
}

type TOptions = Record<string, unknown> & { defaultValue?: string };

/**
 * A catalog-backed stand-in for i18next's `t`, so a test asserts on the real
 * copy without booting i18next: a missing key answers `defaultValue` (then the
 * key itself), and `{{name}}` placeholders are filled from the options.
 */
export function catalogT(namespace: unknown): TFunction<"errors"> {
  const t = (key: string, options?: TOptions): string => {
    const copy = catalogLookup(namespace, key.replace(/^errors:/, ""));
    if (copy === undefined) return options?.defaultValue ?? key;
    if (!options) return copy;

    return copy.replace(/\{\{(\w+)\}\}/g, (_, name: string) => String(options[name] ?? ""));
  };

  return t as unknown as TFunction<"errors">;
}
