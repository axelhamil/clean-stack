# i18n rules

The translation source of truth: typed catalogs, locale helpers and an isolated i18next factory, shared by the app (UI) and the API (emails). Auto-loaded under `packages/i18n/`. How the front consumes it (the "no literal at the call site" rule, `getErrorsT`, locale cookie): `apps/app/CLAUDE.md`.

## Layout

```
src/
  catalogs/<locale>/<namespace>.ts   typed object literals (`as const`), never `.json`; `index.ts` assembles the namespaces
  locales.ts                          `LOCALES`, `Locale`, `DEFAULT_LOCALE`, `isLocale`, `toLocale`
  resolve.ts                          `resolveLocale(candidates)`: cookie, then browser languages, region subtag dropped
  load-catalog.ts                     per-locale dynamic import; English ships in the main bundle
  create-instance.ts                  `createI18n({ locale, resources })`
  lookup.ts, types.ts                 catalog lookup helper, i18next `CustomTypeOptions` typed on the English catalog
  __tests__/parity.test.ts            fails on any key present in one locale and absent in the other
```

## Rules

1. **English is the source of truth.** Add the key to `catalogs/en/<namespace>.ts` first (the typed `t()` rejects a call site that uses it before it exists), then to `catalogs/fr/`. **Why**: the English catalog types every key; the parity test is the gate that holds the other locales in step, it is not optional.
2. **Namespaces are derived from the catalog, never listed by hand** (`NAMESPACES = Object.keys(catalog)`). **Why**: a second hand-kept list drifts, and the copy that drifts is the one nothing reads at build time: a namespace missing from it is silently never checked for parity.
3. **A locale value is narrowed at the boundary with `toLocale`** (DB column, session payload, JSON body), never a local `isLocale(x) ? x : DEFAULT` ternary. A new locale is a new entry in `LOCALES`, a new catalog folder and a branch in `loadCatalog`, together.
4. **One fresh i18next instance per use, never a shared singleton, on the server.** **Why**: the email worker renders for many recipients in sequence, a shared mutable `language` would leak one recipient's locale into the next message. `createI18n` registers the English catalog under `DEFAULT_LOCALE` alongside the target locale, because `fallbackLng` can only fall back to resources that are loaded; without it a key missing from a translation renders as the raw key.
5. **Dynamic parts are `{{placeholders}}`, formatted by the caller.** Dates and numbers are never pre-formatted into a value (`useFormatDate` in the app); a key is a sentence a translator can read alone.
6. **Prose that is legally per-locale content** (policy bodies) is not in these catalogs; the exceptions are listed in `apps/app/CLAUDE.md`.

## Commands

`pnpm --filter @packages/i18n test` (vitest). Adding a key to one locale only fails `parity.test.ts`: that is the signal, not a flake.
