import { enCatalog, lookupCatalogValue, type Namespace } from "@packages/i18n";
import type { TFunction } from "i18next";

/**
 * Resolves a label key against the English catalog the way its call site
 * reads it: a cross-namespace key carries its `ns:` prefix
 * (`common:roles.admin`), a bare key resolves against `namespace`.
 */
export function enLabel(key: string, namespace: Namespace): string | undefined {
  const [prefix, path] = key.includes(":") ? key.split(":") : [namespace, key];
  if (prefix === undefined || path === undefined) return undefined;

  return lookupCatalogValue((enCatalog as Record<string, unknown>)[prefix], path);
}

type TOptions = Record<string, unknown> & { defaultValue?: string };

/**
 * A catalog-backed stand-in for i18next's `t`, so a test asserts on the real
 * copy without booting i18next: a missing key answers `defaultValue` (then the
 * key itself), and `{{name}}` placeholders are filled from the options.
 */
export function catalogT(namespace: unknown): TFunction<"errors"> {
  const t = (key: string, options?: TOptions): string => {
    const copy = lookupCatalogValue(namespace, key.replace(/^errors:/, ""));
    if (copy === undefined) return options?.defaultValue ?? key;
    if (!options) return copy;

    return copy.replace(/\{\{(\w+)\}\}/g, (_, name: string) => String(options[name] ?? ""));
  };

  return t as unknown as TFunction<"errors">;
}
