# Feature rules

Loaded when working inside any `features/<feature>/`. Routing, anatomy, queries/mutations, composition. App-wide rules in `apps/app/CLAUDE.md`.

## Anatomy

Symmetry with api modules: `features/<feature>/` ≈ a back-end module slice. **No `domain/` on the front** — UI domain isn't pure (React deps), don't fake it. Sub-folders: `api/`, `components/`, `forms/`, `hooks/`. Routes (`<name>.route.tsx`) and feature-private schemas (`<feature>.schema.ts`) flat at root. **No underscore-private folders inside features** — Next.js App Router route-file convention; doesn't transfer. Don't nest sub-domains under area folders (`features/<area>/<feature>/`) — area = layout route, feature = top-level.

1. Routes flat at root: `<name>.route.tsx`. Multi-page → multiple route files. 0-route features expose only components (library features).
2. Components flat — group only when ≥ 5 files share a concern.
3. Hooks never call `fetch` directly — through `shared/api/api-client.ts`.
4. Schemas zod with `z.infer` co-located. Single-schema flat (`features/<x>/<x>.schema.ts`); promote to `schemas/` on 2nd file.
5. **Forms in `forms/<action>-form.tsx`**, isolated from host (Card/Sheet/Dialog = layout only; form owns RHF state, `zodResolver`, validation, submit). Pages composable, forms reusable across hosts.
6. Cross-feature reuse not pre-solved — extract to `packages/ui` if presentational, or promote one feature to own it.

## Routing — file-based via `virtualRouteConfig`, vertical slice preserved

`apps/app/routes.ts` declares the whole tree once (`rootRoute`/`layout`/`route`/`index` from `@tanstack/virtual-file-routes`), with every leaf pointing at its `<name>.route.tsx`, path relative to `routesDirectory: "./src"` (`apps/app/vite.config.ts`). This is deliberately *not* a directory-mount (`physical()`) and *not* a flattened `src/routes/` tree: the pathless layouts wrap routes drawn from several different features, which a directory can't express, and flattening would destroy the vertical slice. `<name>.route.tsx` does `export const Route = createFileRoute("/full/path/id")({ ... })` — the plugin generates `src/routeTree.gen.ts` from `routes.ts` at build/dev time — the file is committed (not gitignored) so a fresh clone type-checks without running a build first; regenerate it whenever `routes.ts` changes.

**Code-splitting via `autoCodeSplitting` (one file per route).** `<name>.route.tsx` both declares the route (`export const Route = createFileRoute("/full/path/id")({ ... })`) and defines the page component inline. **The component must stay internal — never exported** (`function <Name>Page() { ... }`, not `export function`): `autoCodeSplitting` only splits a component that's local to its route file, so exporting it re-attaches the page to the static module graph and silently stops it being its own chunk. Access route state through the `Route` binding itself — `Route.useSearch()`, `Route.useParams()`, `Route.useRouteContext()` — never `getRouteApi`, which only makes sense when route and page are separate modules. Default preload `"intent"`. Adding a route also means adding its entry to `apps/app/routes.ts` (the virtual route tree) — a `<name>.route.tsx` file with no entry there never renders, and — because `routes.ts`'s file references are string paths — `knip` can't see the missing wiring either.

**Library features (zero-route).** Some features ship components/forms/hooks but no `<x>.route.tsx`. Route-owning features MAY import from a library feature (single allowed cross-feature import); library features never import from other features. Composition flows downward, preventing cyclic feature graphs.

**Area = layout route, not folder.** Multi-page UI shell is a pathless layout node in `apps/app/routes.ts` (e.g. `_shell`, `settings`) pointing at a `router/*.tsx` layout component with sidebar+tabs+`<Outlet />`. Children nest under it as further `routes.ts` entries. Never `features/<area>/` mixing shell with sub-domain code.

## Form contract

`react-hook-form`+`zodResolver`+shadcn `Form`. Always pass `defaultValues` (no flash of uncontrolled). Submit via `form.handleSubmit((values) => mutation.mutate(values))` — never manual `(e) => …`.

## Schema contract — split loose vs strict for the same field

Field *captured* in one flow (sign-in: transmit, server validates) and *created* in another (sign-up/reset: enforce strength) needs two schemas — strength-validating sign-in locks out users with old passwords needing to log in *to change them*. NIST SP 800-63B 2024 deprecates required special chars; stronger guarantees → `zxcvbn-ts`.

## Queries / mutations decision table

Options factories compose better than hook wrappers: typed, prefetchable in `beforeLoad`, call site overrides per-use. Hook wrappers earn keep only when side-effects *always* fire.

| Case | Where | Form |
|---|---|---|
| Query feature-scoped | `features/<x>/api/<noun>.queries.ts` | `xxxQueryOptions` via `queryOptions(...)`. `useQuery`+`ensureQueryData` in `beforeLoad`. |
| Query cross-feature | `shared/api/queries/<noun>.ts` | Same shape. Promote on 2nd consumer. |
| Mutation cross-feature or multi-step | `shared/api/mutations/<verb>.ts` | `xxxMutationOptions` via `mutationOptions(...)`. Call site owns side-effects. |
| Mutation feature-specific with bundled side-effects | `features/<x>/hooks/use-<verb>.ts` | Hook wrapping `useMutation`. Owns `onSuccess`/`onError`. |
| Pure React utility | `features/<x>/hooks/` or `shared/` | Plain hook. |

A hook doing only `return useMutation({ mutationFn })` is indirection — promote to factory.

### `mutationOptions` cookbook

In `features/<x>/api/<verb-noun>.mutation.ts` (feature) or `shared/api/mutations/<verb-noun>.ts` (cross). Export `<verbNoun>MutationOptions`. Never prefix `use-` — these are objects.

1. Side-effects belong to call site — no `toast`/`navigate`/`invalidateQueries` in factory.
2. Spread, don't override: `useMutation({ ...createXMutationOptions, onSuccess: … })`.
3. `mutationKey` = `[<resource>, <verb>]` — `useIsMutating({ mutationKey })` finds in-flight.
4. Types via `InferRequestType`/`InferResponseType<…, 200>` + `if (!res.ok) throw`.
5. Multi-step workflows in factory. Single `mutationFn` returns server-verified output.
6. Single-call factories thread `init.signal`. Multi-step with cleanup typically can't honour cancellation — document if so.

## Composition patterns (promote, don't patch)

Raw `<a className="text-…">`, `<span className="…rounded-full bg-…">`, `<div className="…rounded-lg border bg-…">` in a feature = skipped slot or duplicated primitive.

- **Cards**: actual slots (`Card`+`CardHeader`+`CardTitle`+`CardContent`+optional `CardDescription`/`CardFooter`/`CardAction`). Never re-add `pt-6`/`space-y-4`.
- **Numbered/iconic markers**: `Badge variant="secondary"` with layout. Not hand-rolled spans.
- **Styled links/nav items**: `NavLink` from `@packages/ui` (`plain`/`pill`/`underline`, `active` flag). Compose via `asChild`. Never raw `<a className="text-…">`.
- **List bullets**: lucide icons over custom spans.
