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

## Adding a page

Append it to `PUBLIC_PAGES` or `AUTHENTICATED_PAGES` in [`pages.ts`](./pages.ts).
Nothing else — the spec iterates both lists across both colour schemes.

## Changing a colour token

Measure, do not compute. Tailwind mixes opacity in oklab, so a hand-rolled
oklch → sRGB blend misjudges anything with an alpha suffix: during this phase
the arithmetic condemned every destructive button in dark (fine in reality) and
cleared `--primary` (actually failing). Propose a value by calculation if it
helps, then let the gate rule on it.
