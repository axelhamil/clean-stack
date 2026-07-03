---
name: feature-slice
description: Use when implementing a story or user-facing feature on this repo once acceptance criteria exist. Trigger on "implémente la story", "nouvelle feature", "dev cette story", "feature slice". Not for bugfixes, refactors, or infra chores.
---

# Feature Slice

Builds one story as a vertical slice through clean-stack, using a sequential pipeline of specialized subagents with two human gates. The orchestrator (main loop) never writes feature code itself — it dispatches roles, relays compact reports, and enforces gates.

## Hard rules

- **No code before Gate 1.** The architect's plan must be explicitly approved by the user first. No exceptions, not for "small" stories.
- **Never commit, never open a PR.** Only on explicit user request after Gate 2.
- **Mockups are law.** If the story involves UI visuals, mockup image files must exist on disk before the front phase (ask the user for paths, or `docs/stories/<slug>/`). Subagents cannot see conversation images — only files they can `Read`. Pixel-perfect or it's wrong; a blocking technical constraint gets reported before implementing around it.
- **One story = one vertical slice.** A story touching only one layer of a user-facing feature is mis-split — flag it before starting.

## Pipeline

Run roles sequentially with the Agent tool. Each role's final message is a raw handoff report (paths, decisions, deviations — not prose) that feeds the next role's prompt. Skip back or front phases the story doesn't touch.

**0. Intake** (main loop) — restate the story and acceptance criteria. Fuzzy criteria → stop and brainstorm with the user. UI story without mockup files → ask for the paths now, not at step 4.

**1. Explorer** (`Explore` agent) — map what exists: target module, the closest precedent to imitate (aggregate/route/feature), schema impact. Returns: files to imitate, files to touch, gotchas.

**2. Architect** (`Plan` agent) — the prompt MUST require event storming first: enumerate the story's domain events — they ARE the business — then derive the aggregate/VOs (or a `<Noun>Service` when no aggregate; decide by aggregate, not I/O count). Then the slice plan: files per layer (domain → use case → Hono route → query/mutation factory in `features/<x>/api/` → hooks → components → 2-file route) and the DoD obligations the implementers must honor: event emits with actor (`actorUserId` when actor ≠ subject), `IInstrumentation` spans on new I/O methods, `ScopedRepository` if the aggregate is owned, migration if schema changes.

→ **GATE 1 — present the plan to the user, wait for explicit approval.**

**3. Back implementer** (`general-purpose`) — receives the plan's back section + explorer brief. Strict TDD (superpowers:test-driven-development): domain → application → route. Layer rules auto-load via `apps/api/src/modules/CLAUDE.md` the moment it touches module files — its prompt carries the acceptance criteria, not a re-derivation of the rules.

**4. Front implementer** (`general-purpose`) — receives the plan's front section + mockup file paths. First action: `Read` every mockup. Then factory → hooks → components → 2-file route. Rules auto-load via `apps/app/src/features/CLAUDE.md`.

**5. Adversarial reviewer** (`feature-dev:code-reviewer`) — attacks the full diff against the acceptance criteria and the 8 cross-cutting rules in the root `CLAUDE.md` (silent state change, missing actor, missing span, scope leak…), then the orchestrator runs the gates:

```
pnpm ci:check && pnpm turbo run build type-check test && pnpm check:duplication && pnpm check:unused
```

Findings → fix loop: re-dispatch the relevant implementer (trivial fixes: orchestrator fixes directly), re-review. Loop until clean.

**6. Demo prep** (main loop) — run the app, exercise the slice end-to-end. UI story: Playwright screenshot of the rendered feature presented side-by-side with the mockup, plus the list of every deviation.

→ **GATE 2 — the user reviews code and rendered result manually. Stop here. Commit/PR only if explicitly requested.**
