# Module rules

`modules/<name>` holds one business module, published in the workspace as `@modules/<name>`. Auto-loaded for every file under `modules/`. Cross-cutting rules: `/CLAUDE.md`. The rules that still live in `apps/api/CLAUDE.md` (module anatomy, layer purity, port placement, CQRS, DI, domain events, testing) apply here unchanged until they move.

## Anatomy

```
modules/<name>/
  package.json        exports per layer pointing at src/ and schemas/, no build
  tsconfig.json       noEmit
  bunfig.toml         preload from @packages/test, only when a test needs one
  schemas/            the tables this module owns
  scripts/            check-*.ts against a real database, about this module only
  src/
    <name>.module.ts  defineModule<<Name>Prerequisites>()
    domain/  application/{ports,services,use-cases,dto,event-handlers}  infrastructure/{repositories,adapters,http}
    testing/          fixtures other tests may import
    __TESTS__/        every test, layering.test.ts included
```

`<name>/CLAUDE.md` exists only for rules no other guide or skill holds (invariants, events emitted, ports exposed, traps).

## Contract

1. **The module exports factories, the host composes them.** `<name>.module.ts` (`defineModule`), `create<Name>Routes(deps)`, `create<Name>InternalRoutes(deps)`, plus what the host must bind (application services, event handlers) and every port or service type the host container's inferred type names (its declaration emit needs a public specifier for each, else `TS2883` in `container.ts`). Only an app imports `*.module.ts`. **Why**: a second importer would inherit the module's prerequisites and could wire it twice.
2. **Everything from outside arrives in `<Name>Prerequisites`**: `ddd-kit` ports, the ports the module declares, its typed settings. Never `env`, never the built container, never the auth instance. **Why**: a package that reads ambient state cannot be type-checked or tested alone, and swapping a provider would touch its code.
3. **A need towards another module is a port the consumer declares**, served by an application service of the provider and bound by the host. Never an import of the other module. **Why**: the dependency stays visible in one host file and either side can be removed without touching the other.
4. **Events go through the one catalog in `packages/events`**, emitted in the same unit of work as the write. A handler reacting to another module's event lives in the reacting module and subscribes by event type, never by importing the emitter.
5. **A read joining tables of two modules lives in the host** (`apps/api/src/queries/`) behind a port the module declares. **Why**: a module reading another module's tables couples their schemas without any visible dependency.
6. **Routes receive their guards** (`RouteGuards`) and their services through `deps`. A route may read its own tables; it writes only through a service or a use case.
7. **Relative imports inside the module, no `@/` alias, no barrel.** Other modules and apps reach it only through the `exports` of its `package.json`.
8. **Source only**: `exports` point at `src/` and `schemas/`, no build script, no `dist/` (root rule 4).

## Boundaries

`pnpm check:boundaries` scans `apps packages modules` with `.dependency-cruiser.cjs`: no cross-module import (tests may reach another module's `schemas/` only, schemas reach only other schemas), only apps import `*.module.ts`, `packages/` never reaches a module or an app, a module never imports an app, the fronts never import a module, `domain/` and `application/` stay free of infrastructure, schemas, database and frameworks, host queries read modules through `schemas/` and `application/ports/` only, no runtime cycle. Each module adds `src/__TESTS__/layering.test.ts` calling `assertModuleLayering` from `@packages/test/source-scan` for what imports cannot express (no throw in domain or application, no write from a routes file, no transaction parameter or opener, no env read, no reach into the host).

## Moving a module here

A move keeps the HTTP contract: `pnpm check:api-shape` compares the `AppType` declaration with its frozen copy in `apps/api/shape/` regardless of union and member order and of local import paths, and the `METHOD path` inventory line for line. A drift on a move is a changed contract until proven otherwise. The one accepted drift is the text of a type alias whose declaring package changed (`import("@packages/a").X` becoming `import("@packages/b").X`): prove the frozen copy, with only those specifiers rewritten, canonically equal to the emitted declaration, then refreeze with `pnpm api-shape:update` in the same commit and say so in the PR. Any other drift is fixed in the code, never refrozen. **Why**: the frozen copy is what the typed client was built against, so a refreeze that is not proven structural silently ships a contract change under a refactor; never edit the copy by hand, the tool is the only writer.
