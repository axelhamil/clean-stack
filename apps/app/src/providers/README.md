# providers/

Bootstrap layer. Composes the React Provider tree (Router, Query, Theme, Toaster, etc.).

Mirrors `apps/api/src/di/`: this is where everything gets wired together at startup.

Wired exactly once in `main.tsx`. Do not put feature logic here.

Current contents:

- `app-providers.tsx` — `<StrictMode>` → `<ThemeProvider>` (next-themes) → `<QueryClientProvider>` → `<RouterProvider>` + `<Toaster />` (sonner)

May import from: `adapters/`, `common/`, `@packages/ui`, `routeTree.gen.ts`.
Must NOT import from: `features/`, `routes/`.
