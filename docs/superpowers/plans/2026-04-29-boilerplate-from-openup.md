# Boilerplate Restructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the entire content of `/home/axel/DEV/clean-stack` with a minimal, generic monorepo boilerplate inspired by `raphael-openup-app`'s structure — preserving only `.git/` and `CHANGELOG.md` from the existing repo. End state: `apps/api` (bare Hono skeleton), `apps/app` (bare Vite+React+TanStack skeleton), 5 packages (ddd-kit, drizzle, test, typescript-config, ui), root tooling, neutral docs.

**Architecture:** Single destructive restructure done locally without intermediate commits — partial states do not type-check. One final commit at the end after `pnpm install` and full verification pass.

**Tech Stack:** pnpm + Turborepo + Biome + Husky + commitlint + semantic-release. Hono + Node.js for api. Vite + React 19 + TanStack Router + Tailwind 4 for app. Drizzle + Postgres. ddd-kit primitives.

**Reference paths:**
- Source repo (template, do not modify): `/home/axel/DEV/raphael-openup-app/`
- Target repo (rewritten): `/home/axel/DEV/clean-stack/`

**Environment notes:**
- `node` and `npx` are symlinked at `~/.local/bin/{node,npx}` (already on global PATH), so husky's `sh` subshells find node without env munging. No `PATH=...` prefixes needed anywhere.
- Commit signing is operational (SSH key in place). Do NOT pass `-c commit.gpgsign=false`.
- Use `dangerouslyDisableSandbox: true` only for the final `git commit` step (husky reads beyond the working dir).

---

## Task 1: Backup CHANGELOG.md and verify pre-conditions

**Files:**
- Read: `/home/axel/DEV/clean-stack/CHANGELOG.md`
- Create: `/tmp/clean-stack-backup/CHANGELOG.md`

**Why:** `CHANGELOG.md` is the only file we're salvaging from the current repo. Everything else is destroyed in Task 2.

- [ ] **Step 1: Verify the source template repo exists**

Run: `test -d /home/axel/DEV/raphael-openup-app/apps/api && echo OK`
Expected: `OK`

- [ ] **Step 2: Verify clean-stack is on main with the spec commit and the spec staged**

Run: `cd /home/axel/DEV/clean-stack && git rev-parse --abbrev-ref HEAD && git log --oneline -1`
Expected: branch is `main`; HEAD shows the spec commit (`docs: add boilerplate restructure design spec`).

- [ ] **Step 3: Verify the working tree has no uncommitted changes**

Run: `cd /home/axel/DEV/clean-stack && git status --porcelain`
Expected: empty output. If non-empty, STOP and ask the user — do not proceed with the nuke until the tree is clean.

- [ ] **Step 4: Backup CHANGELOG.md to /tmp**

Run: `mkdir -p /tmp/clean-stack-backup && cp /home/axel/DEV/clean-stack/CHANGELOG.md /tmp/clean-stack-backup/CHANGELOG.md && wc -l /tmp/clean-stack-backup/CHANGELOG.md`
Expected: positive line count (file copied).

---

## Task 2: Nuke the working tree

**Files:**
- Delete: everything under `/home/axel/DEV/clean-stack/` except `.git/` and `docs/` (the spec + this plan live there)

**Why:** Spec calls for a total nuke. `.git/` preserves history. `docs/` preserves the spec and plan files used to drive this restructure (they belong to the new repo too). `CHANGELOG.md` is restored later from /tmp.

- [ ] **Step 1: Remove all top-level entries except .git and docs**

Run:
```bash
cd /home/axel/DEV/clean-stack && \
find . -mindepth 1 -maxdepth 1 ! -name '.git' ! -name 'docs' -exec rm -rf {} +
```
Expected: command exits 0, no errors.

- [ ] **Step 2: Verify only .git and docs remain**

Run: `cd /home/axel/DEV/clean-stack && ls -la`
Expected: only `.`, `..`, `.git/`, and `docs/` are present.

- [ ] **Step 3: Sanity-check git still works**

Run: `cd /home/axel/DEV/clean-stack && git log --oneline -1`
Expected: spec commit visible (history preserved).

---

## Task 3: Create root tooling files

**Files:**
- Create: `/home/axel/DEV/clean-stack/package.json`
- Create: `/home/axel/DEV/clean-stack/pnpm-workspace.yaml`
- Create: `/home/axel/DEV/clean-stack/turbo.json`
- Create: `/home/axel/DEV/clean-stack/biome.json` (copy from openup)
- Create: `/home/axel/DEV/clean-stack/knip.json` (copy from openup)
- Create: `/home/axel/DEV/clean-stack/.jscpd.json` (copy from openup)
- Create: `/home/axel/DEV/clean-stack/commitlint.config.mjs` (copy from openup)
- Create: `/home/axel/DEV/clean-stack/.releaserc.json` (copy from openup)
- Create: `/home/axel/DEV/clean-stack/.husky/commit-msg`, `.husky/pre-commit`, `.husky/pre-push` (copy from openup)
- Create: `/home/axel/DEV/clean-stack/docker-compose.yaml`
- Create: `/home/axel/DEV/clean-stack/tsconfig.json`
- Create: `/home/axel/DEV/clean-stack/.gitignore` (copy from openup)
- Create: `/home/axel/DEV/clean-stack/.npmrc` (copy from openup)
- Create: `/home/axel/DEV/clean-stack/.nvmrc` (copy from openup)
- Create: `/home/axel/DEV/clean-stack/LICENSE` (copy from openup)

- [ ] **Step 1: Copy unchanged tooling files from openup**

Run:
```bash
cp /home/axel/DEV/raphael-openup-app/biome.json /home/axel/DEV/clean-stack/biome.json
cp /home/axel/DEV/raphael-openup-app/knip.json /home/axel/DEV/clean-stack/knip.json
cp /home/axel/DEV/raphael-openup-app/.jscpd.json /home/axel/DEV/clean-stack/.jscpd.json
cp /home/axel/DEV/raphael-openup-app/commitlint.config.mjs /home/axel/DEV/clean-stack/commitlint.config.mjs
cp /home/axel/DEV/raphael-openup-app/.releaserc.json /home/axel/DEV/clean-stack/.releaserc.json
cp /home/axel/DEV/raphael-openup-app/.gitignore /home/axel/DEV/clean-stack/.gitignore
cp /home/axel/DEV/raphael-openup-app/.npmrc /home/axel/DEV/clean-stack/.npmrc
cp /home/axel/DEV/raphael-openup-app/.nvmrc /home/axel/DEV/clean-stack/.nvmrc
cp /home/axel/DEV/raphael-openup-app/LICENSE /home/axel/DEV/clean-stack/LICENSE
mkdir -p /home/axel/DEV/clean-stack/.husky
cp /home/axel/DEV/raphael-openup-app/.husky/commit-msg /home/axel/DEV/clean-stack/.husky/commit-msg
cp /home/axel/DEV/raphael-openup-app/.husky/pre-commit /home/axel/DEV/clean-stack/.husky/pre-commit
cp /home/axel/DEV/raphael-openup-app/.husky/pre-push /home/axel/DEV/clean-stack/.husky/pre-push
chmod +x /home/axel/DEV/clean-stack/.husky/commit-msg /home/axel/DEV/clean-stack/.husky/pre-commit /home/axel/DEV/clean-stack/.husky/pre-push
```
Expected: all commands exit 0.

- [ ] **Step 2: Create `pnpm-workspace.yaml`**

Write to `/home/axel/DEV/clean-stack/pnpm-workspace.yaml`:
```yaml
packages:
  - "apps/*"
  - "packages/*"
```

- [ ] **Step 3: Create `turbo.json` (no Capacitor/web tasks)**

Write to `/home/axel/DEV/clean-stack/turbo.json`:
```json
{
  "$schema": "https://turbo.build/schema.json",
  "globalEnv": ["DATABASE_URL"],
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "env": ["DATABASE_URL"],
      "outputs": ["dist/**", "build/**"],
      "passThroughEnv": ["DATABASE_URL"]
    },
    "dev": {
      "dependsOn": ["db:migrate"],
      "cache": false,
      "persistent": true,
      "env": ["DATABASE_URL"]
    },
    "start": {
      "dependsOn": ["build"],
      "cache": false,
      "env": ["DATABASE_URL"]
    },
    "test": {
      "dependsOn": ["^build"],
      "outputs": []
    },
    "test:watch": { "cache": false },
    "test:coverage": {
      "dependsOn": ["^build"],
      "cache": false
    },
    "type-check": {
      "dependsOn": ["^build"],
      "outputs": []
    },
    "format": { "outputs": [] },
    "lint": { "outputs": [] },
    "db:generate": { "cache": false, "env": ["DATABASE_URL"] },
    "db:push": { "cache": false, "env": ["DATABASE_URL"] },
    "db:seed": { "cache": false, "env": ["DATABASE_URL"] },
    "db:studio": { "cache": false, "env": ["DATABASE_URL"] },
    "db:migrate": {
      "dependsOn": ["db:generate"],
      "cache": false,
      "outputs": ["drizzle/migrations/**"],
      "env": ["DATABASE_URL"]
    },
    "ui:add": { "cache": false, "interactive": true }
  }
}
```

- [ ] **Step 4: Create `package.json` (root) — no `cap:*`, no web/link-router scripts**

Write to `/home/axel/DEV/clean-stack/package.json`:
```json
{
  "name": "clean-stack",
  "private": true,
  "version": "1.1.0",
  "scripts": {
    "build": "turbo build",
    "dev": "turbo dev",
    "dev:api": "turbo dev --filter=api",
    "dev:app": "turbo dev --filter=app",
    "db": "docker compose up -d postgres",
    "db:down": "docker compose down",
    "db:migrate": "turbo db:migrate",
    "db:generate": "turbo db:generate",
    "db:push": "turbo db:push",
    "db:seed": "turbo db:seed",
    "db:studio": "turbo db:studio",
    "ui:add": "turbo ui:add",
    "format": "biome format . --write",
    "lint": "biome lint .",
    "check": "biome check .",
    "fix": "biome check --write .",
    "ci:check": "biome ci .",
    "check:duplication": "jscpd ./packages ./apps/api/src ./apps/app/src",
    "check:unused": "knip",
    "check:all": "pnpm type-check && pnpm check && pnpm check:duplication && pnpm check:unused && pnpm test",
    "clean": "rm -rf node_modules .turbo apps/*/.turbo packages/*/.turbo apps/api/dist apps/app/dist",
    "start": "turbo start",
    "type-check": "turbo type-check",
    "test": "turbo test",
    "test:watch": "turbo test:watch",
    "test:coverage": "turbo test:coverage",
    "setup": "pnpm install && pnpm db && pnpm db:push",
    "quick-check": "pnpm type-check && pnpm check",
    "prepare": "husky"
  },
  "devDependencies": {
    "@biomejs/biome": "^2.4.2",
    "@commitlint/cli": "^20.4.1",
    "@commitlint/config-conventional": "^20.4.1",
    "@semantic-release/changelog": "^6.0.3",
    "@semantic-release/git": "^10.0.1",
    "husky": "^9.1.7",
    "jscpd": "^4.0.8",
    "knip": "^5.84.1",
    "lint-staged": "^16.2.7",
    "semantic-release": "^25.0.3",
    "turbo": "^2.8.10"
  },
  "lint-staged": {
    "*.{ts,tsx,js,jsx}": ["biome check --write --no-errors-on-unmatched"],
    "*.{json,md,css,scss,html,yml,yaml}": ["biome format --write --no-errors-on-unmatched"]
  },
  "packageManager": "pnpm@10.26.2",
  "engines": { "node": ">=22.14.0" },
  "pnpm": { "onlyBuiltDependencies": ["sharp", "@swc/core"] }
}
```

- [ ] **Step 5: Create `docker-compose.yaml` (postgres only)**

Write to `/home/axel/DEV/clean-stack/docker-compose.yaml`:
```yaml
services:
  postgres:
    image: postgres:17-alpine
    restart: unless-stopped
    ports:
      - "5432:5432"
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: clean_stack
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      timeout: 5s
      retries: 5

volumes:
  postgres_data:
```

- [ ] **Step 6: Create root `tsconfig.json`**

Write to `/home/axel/DEV/clean-stack/tsconfig.json`:
```json
{
  "extends": "@packages/typescript-config/base.json",
  "compilerOptions": { "noEmit": true },
  "include": [],
  "exclude": ["node_modules", "**/dist", "**/.next", "**/.turbo"]
}
```

- [ ] **Step 7: Verify**

Run: `cd /home/axel/DEV/clean-stack && ls -la`
Expected: see `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `biome.json`, `knip.json`, `.jscpd.json`, `commitlint.config.mjs`, `.releaserc.json`, `.husky/`, `docker-compose.yaml`, `tsconfig.json`, `.gitignore`, `.npmrc`, `.nvmrc`, `LICENSE`, `.git/`.

---

## Task 4: Copy CI workflows (filtered)

**Files:**
- Create: `/home/axel/DEV/clean-stack/.github/workflows/ci.yml`
- Create: `/home/axel/DEV/clean-stack/.github/workflows/release.yml`

- [ ] **Step 1: Copy ci.yml and release.yml only**

Run:
```bash
mkdir -p /home/axel/DEV/clean-stack/.github/workflows
cp /home/axel/DEV/raphael-openup-app/.github/workflows/ci.yml /home/axel/DEV/clean-stack/.github/workflows/ci.yml
cp /home/axel/DEV/raphael-openup-app/.github/workflows/release.yml /home/axel/DEV/clean-stack/.github/workflows/release.yml
```
Expected: 0 errors.

- [ ] **Step 2: Inspect ci.yml for openup-specific filters/branches and patch if needed**

Read `/home/axel/DEV/clean-stack/.github/workflows/ci.yml`. If it references `apps/web`, `apps/link-router`, `cap:*`, Capacitor, Android, iOS, or any specifically named app filter, edit the file to remove or generalize those references. Otherwise leave as-is.

Run: `grep -E '(web|link-router|capacitor|android|ios|fastlane|wallet)' /home/axel/DEV/clean-stack/.github/workflows/ci.yml`
Expected: empty output (or only matches inside generic comments).

- [ ] **Step 3: Same review for release.yml**

Run: `grep -E '(web|link-router|capacitor|android|ios|fastlane|wallet)' /home/axel/DEV/clean-stack/.github/workflows/release.yml`
Expected: empty output.

---

## Task 5: Copy unchanged packages

**Files:**
- Copy entire dirs: `packages/ddd-kit`, `packages/test`, `packages/typescript-config`, `packages/ui` from openup to clean-stack.

**Why:** These four packages are already generic in the source repo. No content change needed. The `ui` package's marketing components (pricing-card, feature-card, stat-card, pricing-table) are explicitly kept per spec.

- [ ] **Step 1: Copy each package**

Run:
```bash
mkdir -p /home/axel/DEV/clean-stack/packages
cp -R /home/axel/DEV/raphael-openup-app/packages/ddd-kit /home/axel/DEV/clean-stack/packages/ddd-kit
cp -R /home/axel/DEV/raphael-openup-app/packages/test /home/axel/DEV/clean-stack/packages/test
cp -R /home/axel/DEV/raphael-openup-app/packages/typescript-config /home/axel/DEV/clean-stack/packages/typescript-config
cp -R /home/axel/DEV/raphael-openup-app/packages/ui /home/axel/DEV/clean-stack/packages/ui
```

- [ ] **Step 2: Strip per-package node_modules / dist / .turbo / tsbuildinfo if any were copied**

Run:
```bash
find /home/axel/DEV/clean-stack/packages -type d \( -name node_modules -o -name dist -o -name .turbo \) -prune -exec rm -rf {} +
find /home/axel/DEV/clean-stack/packages -type f -name '*.tsbuildinfo' -delete
```

- [ ] **Step 3: Verify each package has its package.json and src/**

Run: `for p in ddd-kit test typescript-config ui; do test -f /home/axel/DEV/clean-stack/packages/$p/package.json && echo "$p ok" || echo "$p MISSING"; done`
Expected: all four print `ok`.

---

## Task 6: Copy and empty packages/drizzle

**Files:**
- Copy: `packages/drizzle/` from openup
- Empty: `packages/drizzle/src/schema/`, `packages/drizzle/src/seeds/`, `packages/drizzle/migrations/`
- Modify: `packages/drizzle/src/index.ts` (remove schema barrel exports)

- [ ] **Step 1: Copy the whole drizzle package**

Run:
```bash
cp -R /home/axel/DEV/raphael-openup-app/packages/drizzle /home/axel/DEV/clean-stack/packages/drizzle
find /home/axel/DEV/clean-stack/packages/drizzle -type d \( -name node_modules -o -name dist -o -name .turbo \) -prune -exec rm -rf {} +
find /home/axel/DEV/clean-stack/packages/drizzle -type f -name '*.tsbuildinfo' -delete
```

- [ ] **Step 2: Empty schema, seeds, migrations**

Run:
```bash
rm -rf /home/axel/DEV/clean-stack/packages/drizzle/src/schema
rm -rf /home/axel/DEV/clean-stack/packages/drizzle/src/seeds
rm -rf /home/axel/DEV/clean-stack/packages/drizzle/migrations
mkdir -p /home/axel/DEV/clean-stack/packages/drizzle/src/schema
mkdir -p /home/axel/DEV/clean-stack/packages/drizzle/src/seeds
mkdir -p /home/axel/DEV/clean-stack/packages/drizzle/migrations
touch /home/axel/DEV/clean-stack/packages/drizzle/src/schema/.gitkeep
touch /home/axel/DEV/clean-stack/packages/drizzle/src/seeds/.gitkeep
touch /home/axel/DEV/clean-stack/packages/drizzle/migrations/.gitkeep
```

- [ ] **Step 3: Read the existing `src/index.ts` and rewrite to drop schema imports**

Read: `/home/axel/DEV/clean-stack/packages/drizzle/src/index.ts`
Replace with content that re-exports only the generic primitives (transaction service, config, type) — no schema barrels.

Write to `/home/axel/DEV/clean-stack/packages/drizzle/src/index.ts`:
```typescript
export * from "./config";
export * from "./services/transaction-manager.service";
export * from "./services/transaction-manager.service.type";
```

(If the existing service file paths differ from the above, adjust to the actual file names found in `packages/drizzle/src/services/`.)

- [ ] **Step 4: Read `packages/drizzle/src/config.ts` and verify it does not import schema files**

Run: `grep -E "from.*schema" /home/axel/DEV/clean-stack/packages/drizzle/src/config.ts`
Expected: empty. If non-empty, comment out the `schema:` field passed to the drizzle client and replace with `schema: {}` so the package can build with an empty schema.

- [ ] **Step 5: Read `packages/drizzle/drizzle.config.ts` and verify schema/migrations paths**

If `drizzle.config.ts` references `src/schema/*` files by name or imports schema, update it to:
```typescript
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  out: "./migrations",
  schema: "./src/schema/*",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
});
```

- [ ] **Step 6: Verify package.json scripts still make sense**

Read `/home/axel/DEV/clean-stack/packages/drizzle/package.json`. Scripts like `db:seed` may import the deleted `src/seeds/plan-config.seed.ts`. If so, change `db:seed` to `echo 'no seeds'` or remove it. Same for any script referencing dropped files.

---

## Task 7: Create apps/api skeleton

**Files:**
- Create: `apps/api/package.json`
- Create: `apps/api/tsconfig.json`, `apps/api/tsconfig.build.json`
- Create: `apps/api/vitest.config.ts`
- Create: `apps/api/.env.example`
- Create: `apps/api/src/index.ts` — minimal Hono app with `/health`
- Create: `apps/api/src/di/container.ts` — empty DI container scaffold
- Create: `apps/api/src/di/modules/.gitkeep`
- Create: `apps/api/src/{domain,application,adapters,routes}/.gitkeep` (empty placeholder dirs)
- Create: `apps/api/src/application/{ports,use-cases,dto,event-handlers}/.gitkeep`
- Create: `apps/api/src/adapters/{middleware,services,repositories,mappers}/.gitkeep`
- Create: `apps/api/common/env.ts` — minimal env validation (DATABASE_URL only)

**Why:** Spec calls for "drop tout on va tout refaire" — api skeleton is bare scaffolding. No middleware, no services, no ports copied from openup. Folder structure documented via `.gitkeep` so devs see the conventional layout.

- [ ] **Step 1: Create directory tree**

Run:
```bash
cd /home/axel/DEV/clean-stack
mkdir -p apps/api/src/domain
mkdir -p apps/api/src/application/{ports,use-cases,dto,event-handlers}
mkdir -p apps/api/src/adapters/{middleware,services,repositories,mappers}
mkdir -p apps/api/src/routes
mkdir -p apps/api/src/di/modules
mkdir -p apps/api/common
for d in apps/api/src/domain apps/api/src/application/ports apps/api/src/application/use-cases apps/api/src/application/dto apps/api/src/application/event-handlers apps/api/src/adapters/middleware apps/api/src/adapters/services apps/api/src/adapters/repositories apps/api/src/adapters/mappers apps/api/src/routes apps/api/src/di/modules; do touch $d/.gitkeep; done
```

- [ ] **Step 2: Create `apps/api/package.json`**

Write to `/home/axel/DEV/clean-stack/apps/api/package.json`:
```json
{
  "name": "api",
  "version": "0.0.0",
  "packageManager": "pnpm@10.26.2",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch --conditions=development src/index.ts",
    "build": "tsc -p tsconfig.build.json && tsc-alias -p tsconfig.build.json --resolve-full-paths",
    "start": "node dist/src/index.js",
    "type-check": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest watch",
    "test:coverage": "vitest run --coverage"
  },
  "dependencies": {
    "@hono/node-server": "^1.19.9",
    "@hono/zod-validator": "^0.7.6",
    "@packages/ddd-kit": "workspace:*",
    "@packages/drizzle": "workspace:*",
    "dotenv": "^17.3.1",
    "hono": "^4.11.10",
    "inwire": "^2.1.6",
    "zod": "^4.3.6"
  },
  "devDependencies": {
    "@packages/test": "workspace:*",
    "@packages/typescript-config": "workspace:*",
    "@types/node": "^25.3.0",
    "tsc-alias": "^1.8.16",
    "tsx": "^4.21.0",
    "typescript": "^5.9.3",
    "vitest": "^3.2.4"
  }
}
```

- [ ] **Step 3: Create `apps/api/tsconfig.json`**

Write to `/home/axel/DEV/clean-stack/apps/api/tsconfig.json`:
```json
{
  "extends": "@packages/typescript-config/hono.json",
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src/**/*", "common/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

(If `@packages/typescript-config/hono.json` does not exist, fall back to `node.json`. Run `ls /home/axel/DEV/clean-stack/packages/typescript-config/` to confirm.)

- [ ] **Step 4: Create `apps/api/tsconfig.build.json`**

Write to `/home/axel/DEV/clean-stack/apps/api/tsconfig.build.json`:
```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "noEmit": false,
    "outDir": "./dist"
  },
  "exclude": ["node_modules", "dist", "**/*.test.ts", "**/__TESTS__/**"]
}
```

- [ ] **Step 5: Create `apps/api/vitest.config.ts`**

Write to `/home/axel/DEV/clean-stack/apps/api/vitest.config.ts`:
```typescript
import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },
});
```

- [ ] **Step 6: Create `apps/api/.env.example`**

Write to `/home/axel/DEV/clean-stack/apps/api/.env.example`:
```
PORT=3000
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/clean_stack
```

- [ ] **Step 7: Create `apps/api/common/env.ts` — minimal env**

Write to `/home/axel/DEV/clean-stack/apps/api/common/env.ts`:
```typescript
import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().url(),
});

export const env = envSchema.parse(process.env);
```

- [ ] **Step 8: Create `apps/api/src/di/container.ts` — empty inwire scaffold**

Inwire 2.x API (verified against `axelhamil/inwire` README): `container<AppDeps>().add(key, factory).build()`. For an empty container, just `.build()` with no `.add()` calls.

Write to `/home/axel/DEV/clean-stack/apps/api/src/di/container.ts`:
```typescript
import { container } from "inwire";

export type AppDeps = Record<string, never>;

export const di = container<AppDeps>().build();
```

When real deps are added later, the pattern is: `container<AppDeps>().add("ILogger", () => new Logger()).add("IDb", (c) => new Db(c.ILogger)).build()`. Modules can be split into `src/di/modules/*.ts` files that take a builder, chain `.add()` calls, and return it (see openup's `infrastructure.module.ts` pattern — but the boilerplate ships none).

- [ ] **Step 9: Create `apps/api/src/index.ts` — minimal Hono app**

Write to `/home/axel/DEV/clean-stack/apps/api/src/index.ts`:
```typescript
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { logger } from "hono/logger";
import { env } from "@/../common/env";

const app = new Hono();

app.use("*", logger());

app.get("/health", (c) => c.json({ status: "ok" }));

serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.log(`API listening on http://localhost:${info.port}`);
});
```

(If `@/../common/env` import path causes issues with the `@` alias scoping, replace with a relative `../common/env` import or move `env.ts` into `src/common/env.ts`.)

---

## Task 8: Create apps/app skeleton

**Files:**
- Create: `apps/app/package.json`
- Create: `apps/app/tsconfig.json`
- Create: `apps/app/vite.config.ts`
- Create: `apps/app/index.html`
- Create: `apps/app/.env.example`
- Create: `apps/app/src/main.tsx`
- Create: `apps/app/src/routes/__root.tsx`
- Create: `apps/app/src/{features,entities,shared}/README.md` (3 dirs, 3 READMEs)

**Why:** "Repart sur du propre" — bare TanStack Router + React shell. No Capacitor, no openup features.

- [ ] **Step 1: Create directory tree**

Run:
```bash
cd /home/axel/DEV/clean-stack
mkdir -p apps/app/src/routes
mkdir -p apps/app/src/features
mkdir -p apps/app/src/entities
mkdir -p apps/app/src/shared
```

- [ ] **Step 2: Create `apps/app/package.json`**

Write to `/home/axel/DEV/clean-stack/apps/app/package.json`:
```json
{
  "name": "app",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "start": "vite preview",
    "type-check": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@packages/ddd-kit": "workspace:*",
    "@packages/ui": "workspace:*",
    "@tanstack/react-router": "^1.99.0",
    "@tanstack/react-query": "^5.62.0",
    "react": "^19.1.0",
    "react-dom": "^19.1.0"
  },
  "devDependencies": {
    "@packages/test": "workspace:*",
    "@packages/typescript-config": "workspace:*",
    "@tanstack/router-plugin": "^1.99.0",
    "@types/node": "^25.3.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.3.4",
    "typescript": "^5.9.3",
    "vite": "^7.0.0",
    "vitest": "^3.2.4"
  }
}
```

(Versions may need bumps — pnpm install will reveal mismatches; bump per resolution errors.)

- [ ] **Step 3: Create `apps/app/tsconfig.json`**

Write to `/home/axel/DEV/clean-stack/apps/app/tsconfig.json`:
```json
{
  "extends": "@packages/typescript-config/react.json",
  "compilerOptions": {
    "baseUrl": ".",
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 4: Create `apps/app/vite.config.ts`**

Write to `/home/axel/DEV/clean-stack/apps/app/vite.config.ts`:
```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";
import { resolve } from "node:path";

export default defineConfig({
  plugins: [TanStackRouterVite({ target: "react", autoCodeSplitting: true }), react()],
  resolve: {
    alias: { "@": resolve(__dirname, "./src") },
  },
  server: { port: 5173 },
});
```

- [ ] **Step 5: Create `apps/app/index.html`**

Write to `/home/axel/DEV/clean-stack/apps/app/index.html`:
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>App</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 6: Create `apps/app/.env.example`**

Write to `/home/axel/DEV/clean-stack/apps/app/.env.example`:
```
VITE_API_URL=http://localhost:3000
```

- [ ] **Step 7: Create `apps/app/src/main.tsx`**

Write to `/home/axel/DEV/clean-stack/apps/app/src/main.tsx`:
```typescript
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider, createRouter } from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { routeTree } from "./routeTree.gen";

const router = createRouter({ routeTree });
const queryClient = new QueryClient();

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("#root not found");

createRoot(rootEl).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>
);
```

(Note: `routeTree.gen.ts` is auto-generated by the TanStack Router Vite plugin on first dev/build. It will not exist on disk yet — type-check before running `pnpm dev:app` will fail. Run `pnpm --filter app dev` once or `pnpm --filter app build` to generate it. Add `routeTree.gen.ts` to `.gitignore` for the app — confirm whether the repo's `.gitignore` already covers it.)

- [ ] **Step 8: Create `apps/app/src/routes/__root.tsx`**

Write to `/home/axel/DEV/clean-stack/apps/app/src/routes/__root.tsx`:
```typescript
import { Outlet, createRootRoute } from "@tanstack/react-router";

export const Route = createRootRoute({
  component: () => (
    <main>
      <Outlet />
    </main>
  ),
});
```

- [ ] **Step 9: Create folder READMEs documenting import direction**

Write to `/home/axel/DEV/clean-stack/apps/app/src/features/README.md`:
```markdown
# features/

One folder per user-facing workflow. Composes UI and triggers application logic.

May import from: `entities/`, `shared/`.
Must NOT import from: other `features/` (no lateral cross-feature imports).
```

Write to `/home/axel/DEV/clean-stack/apps/app/src/entities/README.md`:
```markdown
# entities/

Cross-feature domain entity hooks (React Query) and display components, one folder per entity.

May import from: `shared/`.
Must NOT import from: `features/`, `routes/`.
```

Write to `/home/axel/DEV/clean-stack/apps/app/src/shared/README.md`:
```markdown
# shared/

Zero-business infrastructure. Sub-folders by concern: `api/` (HTTP client, query client),
`hooks/`, `format/`, `i18n/`, `ui/` (generic atoms), `utils/`.

Must NOT import from: `features/`, `entities/`, `routes/`.
```

- [ ] **Step 10: Update `.gitignore` to ignore generated route tree**

Read `/home/axel/DEV/clean-stack/.gitignore`. If it does not already contain `routeTree.gen.ts`, append:
```
apps/app/src/routeTree.gen.ts
```

---

## Task 9: Restore CHANGELOG.md, write README, write CLAUDE.md

**Files:**
- Create: `/home/axel/DEV/clean-stack/CHANGELOG.md` (restored from /tmp)
- Create: `/home/axel/DEV/clean-stack/README.md`
- Create: `/home/axel/DEV/clean-stack/CLAUDE.md`

- [ ] **Step 1: Restore CHANGELOG.md from /tmp**

Run: `cp /tmp/clean-stack-backup/CHANGELOG.md /home/axel/DEV/clean-stack/CHANGELOG.md && wc -l /home/axel/DEV/clean-stack/CHANGELOG.md`
Expected: positive line count.

- [ ] **Step 2: Write minimal `README.md`**

Write to `/home/axel/DEV/clean-stack/README.md`:
```markdown
# clean-stack

Generic monorepo boilerplate for Clean Architecture + DDD projects.

## Stack

- **API**: Hono + Node.js
- **App**: Vite + React 19 + TanStack Router + TanStack Query
- **DB**: Drizzle ORM + Postgres
- **Tooling**: Turborepo, Biome, Husky, commitlint, semantic-release
- **DDD primitives**: `@packages/ddd-kit` (Result, Option, Entity, Aggregate, ValueObject, DomainEvent)
- **DI**: inwire

## Quick start

\`\`\`bash
pnpm install
pnpm db          # start Postgres via docker compose
pnpm db:push     # push initial schema (none yet)
pnpm dev         # start everything in parallel
\`\`\`

Scoped dev:

\`\`\`bash
pnpm dev:api
pnpm dev:app
\`\`\`

## Layout

\`\`\`
apps/
  api/   Hono + Node.js (Clean Arch + DDD layout: domain/, application/, adapters/, di/, routes/)
  app/   Vite + React (routes -> features -> entities -> shared)
packages/
  ddd-kit            DDD primitives
  drizzle            DB client + transaction service (schema/migrations are empty)
  test               Shared vitest config
  typescript-config  Shared tsconfig presets
  ui                 Shared shadcn/ui components
\`\`\`

## Conventions

See `CLAUDE.md` for architecture rules (Result/Option, no null, no throw in domain, CQRS, DI rules, import direction in app).

## Scripts

\`\`\`bash
pnpm type-check        # all workspaces
pnpm check             # Biome lint + format check
pnpm fix               # auto-fix lint/format
pnpm check:duplication # jscpd
pnpm check:unused      # knip
pnpm check:all         # everything + tests
pnpm test
\`\`\`
```

- [ ] **Step 3: Write `CLAUDE.md` aligned to new structure, neutral**

Write to `/home/axel/DEV/clean-stack/CLAUDE.md`:
```markdown
# CLAUDE.md

Generic monorepo boilerplate. Clean Architecture + DDD. No business features included.

## Stack

- **API**: Hono on `@hono/node-server` (plain Node.js)
- **App**: Vite + React 19 + TanStack Router + TanStack Query + Tailwind 4
- **DB**: Drizzle ORM + Postgres
- **DI**: `inwire`
- **Primitives**: `@packages/ddd-kit` (`Result<T,E>`, `Option<T>`, `Entity`, `Aggregate`, `ValueObject`, `UUID`, `DomainEvent`, `BaseRepository`, `UseCase`)
- **Tooling**: pnpm + Turborepo + Biome + Husky + commitlint + semantic-release

## Layout

\`\`\`
apps/
  api/
    src/
      domain/                  Aggregates, Entities, Value Objects, Domain Events
      application/
        ports/                 Interfaces (repositories, services)
        use-cases/             One file per use case
        dto/                   Zod schemas
        event-handlers/        Side effects on domain events
      adapters/
        middleware/            Hono middleware (auth, error, rate-limit)
        services/              External service implementations
        repositories/          Drizzle repositories
        mappers/               Domain <-> DB
      routes/                  Hono route registration
      di/
        container.ts           inwire container
        modules/               One module per bounded context
      common/                  env, auth config
    common/env.ts              Validated env (zod)
  app/
    src/
      main.tsx                 Provider tree (Router, QueryClient)
      routes/                  TanStack Router file-based routes
      features/                One folder per user workflow
      entities/                Cross-feature entity hooks + display components
      shared/                  Zero-business infrastructure
packages/
  ddd-kit                      DDD primitives
  drizzle                      DB client + TransactionService
  test                         Shared vitest config
  typescript-config            tsconfig presets
  ui                           shadcn/ui components
\`\`\`

## Architecture rules

1. **Domain has zero external imports** (only `@packages/ddd-kit` + `zod`).
2. **No `throw` in domain or application** — return `Result<T, E>`.
3. **No `null` or `undefined` for absence** — use `Option<T>`.
4. **Value Objects validate via zod** in `protected validate()`.
5. **Transactions managed in controllers** (route handlers), passed to use cases.
6. **All dependencies injected** via inwire DI. No service locators inside use cases.
7. **No barrel `index.ts` files**; import directly from the file.
8. **Self-documenting code** — no inline comments unless the WHY is non-obvious.
9. **Only `get id()` getter on aggregates**. Access other props via `entity.get('propName')`.

## CQRS

- **Commands** (writes): Controller → Use Case → Aggregate → Repository → EventDispatcher → Handlers
- **Queries** (reads): Controller → Query (direct ORM access, no use case layer)

## App import direction

\`routes/\` → \`features/\` → \`entities/\` → \`shared/\`. No lateral cross-feature imports.

## Domain Events

Events are added in aggregate methods (\`this.addEvent(...)\`), NOT dispatched there. Dispatch happens in use cases AFTER successful persistence:

\`\`\`typescript
const saveResult = await this.repo.create(aggregate);
if (saveResult.isFailure) return Result.fail(saveResult.getError());
await this.eventDispatcher.dispatchAll(aggregate.domainEvents);
aggregate.clearEvents();
\`\`\`

## Testing

BDD style. One test file per use case under \`__TESTS__/\`. Mock at the repository/port level. Test \`Result\`/\`Option\` state transitions.

## Common patterns

\`\`\`typescript
// Result
Result.ok(value);
Result.fail(error);
Result.combine([r1, r2, r3]);

// Option
Option.some(value);
Option.none();
Option.fromNullable(value);

// Aggregate
class Foo extends Aggregate<IFooProps> {
  get id(): FooId { return FooId.create(this._id); }
  static create(props): Foo {
    const e = new Foo({ ...props, createdAt: new Date() }, new UUID());
    e.addEvent(new FooCreatedEvent(e));
    return e;
  }
}

// Value Object
class Email extends ValueObject<string> {
  protected validate(v: string): Result<string> {
    return v.includes("@") ? Result.ok(v) : Result.fail("Invalid email");
  }
}
\`\`\`

## Don't

- Add business features without first agreeing on the bounded context.
- Throw in domain or application.
- Use `null` for absence.
- Add `index.ts` barrels.
- Add inline comments that restate what the code does.
```

---

## Task 10: Install dependencies

**Files:**
- Create (generated): `pnpm-lock.yaml`, `node_modules/`

- [ ] **Step 1: Run `pnpm install` from repo root**

Run: `cd /home/axel/DEV/clean-stack && pnpm install`
Expected: lockfile generated, no fatal resolution errors.

If errors mention version mismatches (e.g., `react@19.1.0` not found), bump to the latest matching version per the error message and re-run. Do not pin random versions blindly — match what pnpm proposes.

- [ ] **Step 2: Verify workspace recognized**

Run: `cd /home/axel/DEV/clean-stack && pnpm list -r --depth=0 | head -20`
Expected: see `api`, `app`, `@packages/ddd-kit`, `@packages/drizzle`, `@packages/test`, `@packages/typescript-config`, `@packages/ui`.

---

## Task 11: Verify type-check, lint, build

**Files:** none modified, this is verification only.

- [ ] **Step 1: Run `pnpm type-check`**

Run: `cd /home/axel/DEV/clean-stack && pnpm type-check`
Expected: all 5 workspaces type-check successfully.

If `apps/app` fails because `routeTree.gen.ts` is missing, generate it first:
```bash
cd /home/axel/DEV/clean-stack/apps/app && pnpm exec vite build --mode development 2>&1 | tail -20 || true
```
Then re-run `pnpm type-check`.

If `apps/api` fails on the `inwire` container line, double-check the import shape against `node_modules/inwire/dist/*.d.ts` — the verified API is `container<AppDeps>().build()` (Step 8 of Task 7), but if the published package on npm differs, adjust accordingly.

- [ ] **Step 2: Run `pnpm check` (Biome)**

Run: `cd /home/axel/DEV/clean-stack && pnpm check`
Expected: 0 errors. If formatting issues, run `pnpm fix` and re-check.

- [ ] **Step 3: Run `pnpm build`**

Run: `cd /home/axel/DEV/clean-stack && pnpm build`
Expected: api builds to `apps/api/dist/`, app builds to `apps/app/dist/`. Packages build their dist/ as needed (ddd-kit uses tsup).

- [ ] **Step 4: Run `pnpm test`**

Run: `cd /home/axel/DEV/clean-stack && pnpm test`
Expected: passes. With no tests, vitest exits non-zero by default; add `passWithNoTests: true` to `apps/api/vitest.config.ts` (and any other workspace's vitest config) if needed.

---

## Task 12: Verify no openup product references

**Files:** none modified, this is verification only.

- [ ] **Step 1: Grep for openup product strings**

Run:
```bash
cd /home/axel/DEV/clean-stack && \
grep -rEi --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=.turbo --exclude-dir=dist --exclude=pnpm-lock.yaml --exclude=CHANGELOG.md \
  '(openup|link-in-bio|qr-code|stripe|capacitor|fastlane|wallet)' . 2>&1 | head -40
```
Expected: empty output. If any match, inspect and clean.

- [ ] **Step 2: Verify directory tree shape**

Run: `cd /home/axel/DEV/clean-stack && find . -maxdepth 3 -type d -not -path '*/node_modules*' -not -path '*/.git*' -not -path '*/.turbo*' -not -path '*/dist*' | sort`
Expected: see exactly the planned tree (`./apps/api`, `./apps/app`, `./packages/{ddd-kit,drizzle,test,typescript-config,ui}`, `./.github/workflows`, `./.husky`).

---

## Task 13: Final commit

**Files:** the entire restructure committed in one commit.

- [ ] **Step 1: Stage all changes**

Run: `cd /home/axel/DEV/clean-stack && git add -A && git status --short | head -40`
Expected: hundreds of new files staged, `CHANGELOG.md` shows up if changed (it shouldn't be modified, just present).

- [ ] **Step 2: Commit (signed, hooks run)**

Run:
```bash
cd /home/axel/DEV/clean-stack && \
git commit -m "$(cat <<'EOF'
feat!: rebuild as generic boilerplate

BREAKING CHANGE: complete repo restructure. The previous Next.js app
with auth/billing/LLM features is removed. New layout: apps/api (Hono),
apps/app (Vite+React+TanStack), 5 packages. No business features.
History preserved via CHANGELOG.md.
EOF
)"
```
Expected: pre-commit hooks (lint-staged, type-check) pass; commit created and SSH-signed.

- [ ] **Step 3: Verify the commit**

Run: `cd /home/axel/DEV/clean-stack && git log --oneline -5 && git show --stat HEAD | head -30`
Expected: see new commit `feat!: rebuild as generic boilerplate` followed by the spec commit and prior history.

- [ ] **Step 4: Do NOT push**

Per user's git rules, push only on explicit user instruction. Stop here and report success.

---

## Self-review against spec

| Spec requirement | Implemented in |
|---|---|
| Nuke total except `.git/` and `CHANGELOG.md` | Task 1 (backup), Task 2 (nuke), Task 9 step 1 (restore) |
| `apps/api` Hono + Node infra-only | Task 7 |
| `apps/app` bare Vite+React+TanStack, no Capacitor | Task 8 |
| Drop `apps/web`, `apps/link-router` | Implicit (never created) |
| Keep packages: ddd-kit, test, typescript-config, ui as-is | Task 5 |
| Keep `packages/drizzle` but empty schema/seeds/migrations | Task 6 |
| Drop `packages/reserved-slugs` | Implicit (never copied) |
| Root tooling kept | Task 3 |
| CI workflows: only `ci.yml` + `release.yml` | Task 4 |
| Drop `.claude/` | Implicit (nuked, never recreated) |
| Drop CONTRIBUTING/CODE_OF_CONDUCT/cursor files/.claude/PRODUCT.md | Implicit (nuked, not recreated) |
| Keep CHANGELOG.md | Task 1 + Task 9 |
| Rewrite README.md neutral | Task 9 step 2 |
| Rewrite CLAUDE.md aligned to new structure, no openup | Task 9 step 3 |
| Adapt root scripts: drop cap:*, web, link-router | Task 3 step 4 |
| `pnpm install` succeeds | Task 10 |
| `pnpm type-check`, `pnpm check`, `pnpm test` pass | Task 11 |
| No openup/stripe/capacitor strings outside CHANGELOG/lockfile | Task 12 |
| One restructure commit | Task 13 |
| Don't push | Task 13 step 4 |

All spec requirements covered.
