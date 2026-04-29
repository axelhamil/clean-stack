# features/

User-facing workflows. One folder per workflow.

File naming follows **Next.js App Router conventions** wherever it doesn't conflict with TanStack Router (which owns `routes/`).

Anatomy (only create sub-folders that earn their place):

- `page.tsx` — feature entry component, mounted by the route
- `layout.tsx` — (optional) feature-level layout wrapper
- `loading.tsx` — (optional) wired as the route's `pendingComponent`
- `error.tsx` — (optional) wired as the route's `errorComponent`
- `_components/` — private colocated components (one component per file, kebab-case)
- `_forms/` — private isolated forms (RHF + zodResolver + shadcn `Form`). Section components mount them; sections never own form state.
- `_hooks/` — private feature-local React hooks (queries, mutations, local state)
- `_schemas/` — private zod schemas

The `_` prefix mirrors Next's "private folder" convention. Inside `features/` it has no routing effect (TanStack scans `routes/` only); we keep it for **visual parity with Next** and as a convention for "internal to this feature".

**Form contract** (`_forms/<action>-form.tsx`):

- `react-hook-form` + `@hookform/resolvers/zod` + shadcn `Form` primitives.
- Always pass `defaultValues` to `useForm`.
- Submit: `form.handleSubmit((values) => mutation.mutate(values))` — never wrap in a manual `(e) => …` handler. The deprecated React `FormEvent` type stays out.
- The form imports its hook (`../_hooks/use-<action>`) and schema (`../_schemas/<thing>.schema`). Never `fetch` directly.

May import from: `adapters/`, `common/`, `@packages/ui`, `@packages/ddd-kit`.
Must NOT import from: other `features/`, `routes/`, `providers/`.
