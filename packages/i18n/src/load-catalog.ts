import enCatalog from "./catalogs/en";
import type { Locale } from "./locales";

// Widens every string-literal leaf (from each catalog's `as const`) to `string`.
// The English catalog's exact literal types stay authoritative only in
// `CustomTypeOptions.resources` (./types.ts) for `t()` key-checking; here we
// only need every locale's catalog to share the same *shape*, since a French
// value is never the same literal as its English source.
type WidenStrings<T> = T extends string ? string : { [K in keyof T]: WidenStrings<T[K]> };

export type Resources = WidenStrings<typeof enCatalog>;

export async function loadCatalog(locale: Locale): Promise<Resources> {
  switch (locale) {
    case "fr":
      return (await import("./catalogs/fr")).default;
    default:
      return enCatalog;
  }
}
