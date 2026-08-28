# Accessibility gate

`@axe-core/playwright` over the pages a regression would hurt most, plus three
interaction checks a rule engine cannot see. Runs on every PR
(`.github/workflows/ci.yml`), and locally with `pnpm --filter app check:a11y`.

## What blocks a merge

- **axe** — zero `serious` / `critical` WCAG 2.1 A/AA violations on the seven
  pages in [`pages.ts`](./pages.ts), **in light and dark**. Dark is not
  decoration: `--primary` failed there while light passed.
- **Landmarks** — exactly one `<main>` and one `<h1>` per page. Already a
  CLAUDE.md rule; this is what makes it enforceable.
- **Keyboard** — every `/sign-in` control is reachable in DOM order, and the
  setup itself signs in without a mouse.
- **Focus trap** — the command palette keeps focus for ten Tab presses and
  releases it on Escape.
- **Reduced motion** — `prefers-reduced-motion: reduce` skips the theme view
  transition entirely (asserted through a `MutationObserver`, since the
  transition leaves no trace once it ends).

Lighthouse is deliberately absent: its a11y category runs a subset of axe, so a
budget of 100 would restate what the axe run already proves, for two more
minutes of CI and one more source of flake.

## Running it locally

The gate audits the **preview build** on port 4173, against a live API:

```sh
docker compose up postgres -d
pnpm db:push && pnpm --filter api db:seed   # seeds dev@example.com
pnpm --filter api dev                        # API on :3000
pnpm --filter app check:a11y                 # builds nothing — run `pnpm --filter app build` first
```

Playwright starts the preview server itself and reuses one already listening.

Two things bite when running repeatedly:

- **`/sign-in` is capped at 5 attempts per 15 min per IP.** One run costs one
  sign-in, which is why the setup doubles as the keyboard test rather than
  spending a second one. The block is also held in the API process
  (`inMemoryBlockDuration`), so clearing the `rate_limit` table is not enough —
  restart the API.
- **A page audited after a gate redirect still looks green.** `audit()` asserts
  the final URL for that reason; if a session or policy gate fires, the failure
  names the redirect instead of silently auditing the wrong page.
- **`workers` is pinned to `4`, but that is not what keeps the rate limiter
  off this suite.** The bucket a full sweep fills is the **IP**-keyed one
  (`global:<ip>`), not the per-user one: the API nulls the user for
  `/api/auth/*` (`sessionMiddleware`), so a signed-in page's session and
  organization queries are counted against the IP, next to every
  unauthenticated page load. Measured over a full sweep: 61 requests in
  `global:60:global:::1` against a then-60/min ceiling — one over, twice in a
  row — while the per-user bucket sat at 39. Worker count bounds neither: the
  ceiling is per minute across the whole run and the IP is identical from every
  worker. What fixed it was tuning the API's burst window to what a page view
  actually costs — a signed-in view fires up to 8 API calls, so 60/min allowed
  ~7 navigations per minute (`GLOBAL_POLICY` in
  `apps/api/src/shared/middleware/rate-limit.policies.ts`, now 300/min burst
  with the 1800/hour sustained ceiling unchanged). The pin to `4` stays as a
  courtesy cap on host load.
- **Resetting the limiter takes two steps.** `DELETE FROM rate_limit` on the
  dev database *and* a restart of the API process — `inMemoryBlockOnConsumed`
  caches the block in-process, so clearing the table alone leaves it in place.

## Adding a page

Append it to `PUBLIC_PAGES` or `AUTHENTICATED_PAGES` in [`pages.ts`](./pages.ts).
Nothing else — the spec iterates both lists across both colour schemes.

## Changing a colour token

Measure, do not compute. Tailwind mixes opacity in oklab, so a hand-rolled
oklch → sRGB blend misjudges anything with an alpha suffix: during this phase
the arithmetic condemned every destructive button in dark (fine in reality) and
cleared `--primary` (actually failing). Propose a value by calculation if it
helps, then let the gate rule on it.
