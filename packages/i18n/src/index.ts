// Side-effect import: `types.ts` only augments i18next's `CustomTypeOptions`,
// so it has nothing to re-export. Importing it from the package entry point is
// what makes `t("…")` key-checked for every consumer, whether or not they also
// import `createI18n`.
import "./types";

export { default as enCatalog, NAMESPACES, type Namespace } from "./catalogs/en";
export { type CreateI18nOptions, createI18n } from "./create-instance";
export { loadCatalog, type Resources } from "./load-catalog";
export { DEFAULT_LOCALE, isLocale, LOCALES, type Locale, toLocale } from "./locales";
export { resolveLocale } from "./resolve";
