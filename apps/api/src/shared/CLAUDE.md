# Shared kernel rules (api)

Loaded when working inside `apps/api/src/shared/`. Cross-cutting infra placement decisor. Module-internal rules in `../modules/CLAUDE.md`. Higher-level concerns in `apps/api/CLAUDE.md`.

## What lives here

- `middleware/` — auth, error, logger, internal-signature, private-network, org, internal-layers (env-gate composing internal middlewares for `/internal/*`)
- `ports/` — cross-context port interfaces (consumed by 2+ contexts, OR pure transport)
- `services/` — cross-context port impls (when no module owns the impl)
- `env.ts`, `logger.ts` — process-level singletons
- `internal-signature.ts` — HMAC primitives (canonicalize/sign/verify)
- `internal-fetch.ts` — `signedInternalFetch`, importable by external schedulers (cron workers, GH Actions) calling `/internal/*`
- `transaction.ts` — `type ITransaction = Transaction` (Drizzle alias). Type-only swap-point exception to "no infra in app layer" rule. Opaque-branded `ITransaction` would force `as unknown as Transaction` everywhere (worse).

## Port placement decisor — `shared/ports/` vs `modules/<x>/application/ports/`

Decisor = *who consumes the port*, not where the impl lives.

- **`shared/ports/`** = consumed by 2+ contexts, OR pure transport with no business orchestration above. Impl in `shared/services/` if no module owns it (config-as-code: provider URL + template IDs, no rules), or in `modules/<owner>/infrastructure/services/` if a module's *use cases* legitimately own it (impl shares env knobs with the orchestrator — splitting splits config surface).
- **`modules/<x>/application/ports/`** = single-context. Impl in `modules/<x>/infrastructure/repositories/`.
- **Promotion**: 2nd module needs an existing module-private port → move it to `shared/ports/`, fix imports. Don't pre-emptively put everything in `shared/`.
- **Asymmetry between port and impl location is OK.** Goal = absence of cross-module coupling, not symmetry.
- `IUnitOfWork<TTx>` is the lone cross-cutting kernel primitive in `@packages/ddd-kit`; concrete impl `TransactionService implements IUnitOfWork<Transaction>` in `@packages/drizzle`. Project pins `TTx = ITransaction`.

## Anti-patterns

- Creating `modules/<x>/` when a context has only an infra adapter (no domain, no use-cases, no aggregate, no DTO, no routes) — that's *shared kernel infra*, not a bounded context. Live in `shared/ports/`+`shared/services/`. Test: removing the "module" leaves only `module.ts`+a single port impl → not a module.
- Importing a port from another module's `application/ports/` — exactly the cross-module coupling `shared/ports/` exists to prevent. Promote first.
- Letting a `shared/ports/` port become orphan after removing its only remaining consumer → demote back to a module's `application/ports/` or delete. Shared kernel always has ≥ 2 consumers OR is cross-cutting infra.
