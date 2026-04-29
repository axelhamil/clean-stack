## [1.8.0](https://github.com/axelhamil/clean-stack/compare/v1.7.0...v1.8.0) (2026-04-29)

### Features

* **api:** wire resend email port + adapter via inwire ([7a33e13](https://github.com/axelhamil/clean-stack/commit/7a33e131d1a7f4c1d621ac57da25b084906ec3e9))

## [1.7.0](https://github.com/axelhamil/clean-stack/compare/v1.6.0...v1.7.0) (2026-04-29)

### Features

* **api:** wire better-auth + structured pino logging + middleware ([65db818](https://github.com/axelhamil/clean-stack/commit/65db8182302a511a7e8233557215d041211edc59))
* **app:** better-auth flows + account security + route gates ([97baa68](https://github.com/axelhamil/clean-stack/commit/97baa68066516b1ddba16b514bdc4b5f6e5f5e0c))
* **ui:** add form-text-field, list-row, text-link primitives ([4325028](https://github.com/axelhamil/clean-stack/commit/43250284a01c230cbf06f6fffb99897bd717f314))

### Refactor

* **app:** rename common/ui to common/components ([8066267](https://github.com/axelhamil/clean-stack/commit/8066267be247dc92d91a91330bf59c9e628e1bd9))
* **ddd-kit:** drop unused http helpers ([cf729de](https://github.com/axelhamil/clean-stack/commit/cf729dea92dfacd0cf6f6b9f9b2105ef22e7d889))

### Documentation

* **claude:** document dev/main release flow ([552aa4f](https://github.com/axelhamil/clean-stack/commit/552aa4f874cefd6804d2220e88f3cd4366e29b68))
* codify auth integration rules + bump lockfile ([ebe7d5b](https://github.com/axelhamil/clean-stack/commit/ebe7d5bf1b622a2c63b957a8abf7da3cec944812))

## [1.6.0](https://github.com/axelhamil/clean-stack/compare/v1.5.1...v1.6.0) (2026-04-29)

### Features

* **app:** frame clean-stack around lean startup build/measure/learn ([c5ddf00](https://github.com/axelhamil/clean-stack/commit/c5ddf006729ffe58c9cd1d10f9942bff90859f3c))

## [1.5.1](https://github.com/axelhamil/clean-stack/compare/v1.5.0...v1.5.1) (2026-04-29)

### Refactor

* **app:** shadcn-pure landing + nav-link primitive ([4da680d](https://github.com/axelhamil/clean-stack/commit/4da680ddd63a0e602801199f3eda2f00e7c1d2d9))

## [1.5.0](https://github.com/axelhamil/clean-stack/compare/v1.4.0...v1.5.0) (2026-04-29)

### Features

* **app:** saas-ready landing rewrite + motion primitives + i18n roadmap ([76df116](https://github.com/axelhamil/clean-stack/commit/76df1160f2ee81ee641a1f0b7acd2b9d42a698ba))

### Documentation

* **roadmap:** add roadmap + minio dev storage ([0ad0851](https://github.com/axelhamil/clean-stack/commit/0ad08511a59a65fe25fc7c7e1ab6542bc8fcb6c8))

## [1.4.0](https://github.com/axelhamil/clean-stack/compare/v1.3.0...v1.4.0) (2026-04-29)

### Features

* **app:** redesign home + typography + theme toggle + arch rules ([be53307](https://github.com/axelhamil/clean-stack/commit/be5330767e7ab5d4bfb4290bcbbb7ad9fdb1313f))

## [1.3.0](https://github.com/axelhamil/clean-stack/compare/v1.2.0...v1.3.0) (2026-04-29)

### Features

* sota april 2026 boilerplate refresh — hono rpc, next-flavored app, lean tooling ([a943390](https://github.com/axelhamil/clean-stack/commit/a94339054816fd538a973fd9bcde73a1cda3fe08))

### Bug Fixes

* **app:** add lucide-react direct dep (used in features/home) ([8dfa4f4](https://github.com/axelhamil/clean-stack/commit/8dfa4f41014724557750590793483de6a8d576b2))
* **ddd-kit:** add @types/node devdep (uses node:crypto) ([d9b045d](https://github.com/axelhamil/clean-stack/commit/d9b045d034fccc8a0015d8609f3771978b089899))
* **tsconfig:** hono preset uses bun types not node (api runs on bun) ([d85fb3e](https://github.com/axelhamil/clean-stack/commit/d85fb3e243f1e30e6162299a6f6163766d0f8a29))

## [1.2.0](https://github.com/axelhamil/clean-stack/compare/v1.1.0...v1.2.0) (2026-04-28)

### ⚠ BREAKING CHANGES

* complete repo restructure. The previous Next.js app
with auth/billing/LLM features is removed. New layout:
- apps/api (Hono + Node.js, bare skeleton)
- apps/app (Vite + React 19 + TanStack Router, bare skeleton)
- packages/{ddd-kit, drizzle, test, typescript-config, ui}

History preserved via CHANGELOG.md.

### Features

* rebuild as generic boilerplate ([5f0d32e](https://github.com/axelhamil/clean-stack/commit/5f0d32e0a46d9931613aaa04cd716987fac033ed))

### Documentation

* add boilerplate restructure design spec ([c55214a](https://github.com/axelhamil/clean-stack/commit/c55214a4059bd1dde9d2e8d6a3401f5bf23583f2))
* add boilerplate restructure implementation plan ([071862d](https://github.com/axelhamil/clean-stack/commit/071862d4dff55bb5b879398584e18683ba597955))

# [1.1.0](https://github.com/axelhamil/CleanStack/compare/v1.0.0...v1.1.0) (2026-02-11)


### Bug Fixes

* **e2e:** use production server in ci ([8abaaa1](https://github.com/axelhamil/CleanStack/commit/8abaaa109c916840bb93a2db85a17f404bd28cd0))
* **nextjs:** add tsconfig paths for workspace packages ([af54d65](https://github.com/axelhamil/CleanStack/commit/af54d65fdbe9c2ff9fad060646269da7258ab7f0))
* vercel build ([2bb3524](https://github.com/axelhamil/CleanStack/commit/2bb35242fc45d30f608f55dda16a92e8ea5b57c4))
* **vercel:** disable framework auto-detection for monorepo ([20a745d](https://github.com/axelhamil/CleanStack/commit/20a745db2916adf1e959ae20b0df636a008b5f65))
* **vercel:** use pnpm build with db:migrate ([64b1cd3](https://github.com/axelhamil/CleanStack/commit/64b1cd3974d93179b09ce8d8f10bf0588f9cc910))
* **vercel:** use turbo directly in build command ([16634e4](https://github.com/axelhamil/CleanStack/commit/16634e4fab9bea387d68466720c6f01edbdfa0b1))


### Features

* **llm:** add application layer dtos (task 20) ([22adab4](https://github.com/axelhamil/CleanStack/commit/22adab45a85957a5c83f8d104f91a772a4f379f6))
* **llm:** add application port interfaces (task 19) ([4074e05](https://github.com/axelhamil/CleanStack/commit/4074e0572c8c389c0f3c70b7ca765f81e1dbdf13))
* **llm:** add domain-prompt class with tests (tasks 17-18) ([fd38cba](https://github.com/axelhamil/CleanStack/commit/fd38cbabc60b44ced819aa0e40eb816c94aa19b9))
* **llm:** complete llm-usage domain implementation (task 16) ([9d5d36f](https://github.com/axelhamil/CleanStack/commit/9d5d36fe24c15544a6c1daabfcc8aeec6713349e))
* **llm:** complete module with ui, server actions, and final validation ([8a725c8](https://github.com/axelhamil/CleanStack/commit/8a725c8eb850bd8f6ac27a91bfe0cd986c87acf8))
* **llm:** create llm module directory structure ([6ed7a05](https://github.com/axelhamil/CleanStack/commit/6ed7a05afd0abf73c8b6469919bdbf4fc5100f85))
* **llm:** create llm module directory structure ([1cfa8ac](https://github.com/axelhamil/CleanStack/commit/1cfa8ac10b140dffe9ff93bf41ce2d0af94132a4))
* **llm:** implement conversation aggregate id ([cf00d3e](https://github.com/axelhamil/CleanStack/commit/cf00d3ea1f267dca0273c1c2d7aadf3d1b1d708f))
* **llm:** implement conversation aggregate with domain events ([6c56653](https://github.com/axelhamil/CleanStack/commit/6c56653f1b1771e1bf98521f351e5a53ef41a921))
* **llm:** implement conversation management use cases (task 28 - green) ([365aa1c](https://github.com/axelhamil/CleanStack/commit/365aa1c18b13246c5d7bec82f9197c6eeaf8afc3))
* **llm:** implement conversation value objects ([402b9e1](https://github.com/axelhamil/CleanStack/commit/402b9e19cee70eb0630352ba367fa0c51d61e56d))
* **llm:** implement create-managed-prompt use case - task 30 green ([0dc62b4](https://github.com/axelhamil/CleanStack/commit/0dc62b41762e32c755dedd8475107f943f545d86))
* **llm:** implement drizzle repositories with type-safe persistence mapping ([0d14dbb](https://github.com/axelhamil/CleanStack/commit/0d14dbba28cc3da311e39227ceafb60c97a8f1a2))
* **llm:** implement mappers for domain/persistence conversion - task 38 green ([f816de1](https://github.com/axelhamil/CleanStack/commit/f816de1f6380d0280bfa8607718039a0194b2351))
* **llm:** implement message entity and value objects ([f206677](https://github.com/axelhamil/CleanStack/commit/f2066772d10fc753a17e0cabae2fe10fa5653861))
* **llm:** implement query and utility managed prompt use cases - task 34 green ([7e0b0c2](https://github.com/axelhamil/CleanStack/commit/7e0b0c2443db608610af1bfe886a9a8d909fbe76))
* **llm:** implement routing and cost use cases - task 36 green ([c96b39a](https://github.com/axelhamil/CleanStack/commit/c96b39a0ddd7021f2942a80f6ad91b5013bf3fe9))
* **llm:** implement send chat message use case (task 26 - green) ([95a2f96](https://github.com/axelhamil/CleanStack/commit/95a2f96a56b27354a3d1dff452b9db5b155de0e6))
* **llm:** implement send completion use case (task 22 - green) ([6760c9c](https://github.com/axelhamil/CleanStack/commit/6760c9c2d8e5ff521e61e71cd534fdaa9bb34a24))
* **llm:** implement stream completion use case (task 24 - green) ([e84ff79](https://github.com/axelhamil/CleanStack/commit/e84ff79a84bdfd6364f35b40f1d4695e07786768))
* **llm:** implement update-managed-prompt use case - task 32 green ([1a4c37f](https://github.com/axelhamil/CleanStack/commit/1a4c37f01acc5dc1caa2297cc6d353c86b1b5912))
* **llm:** mark all acceptance criteria as complete ([26750f2](https://github.com/axelhamil/CleanStack/commit/26750f2163cc2171fbfbb0d4858b3a37874c87d0))
* **llm:** verify llm database schema ([d31324e](https://github.com/axelhamil/CleanStack/commit/d31324eab9f14e8563149ee2eb44c869725215b1))
* **llm:** write repository tests (red phase) - task 39 ([e6bdfd2](https://github.com/axelhamil/CleanStack/commit/e6bdfd22c9638cc8006e79df3df188e2309ce104))
* **llm:** write routing and cost use case tests - task 35 red ([6867fcd](https://github.com/axelhamil/CleanStack/commit/6867fcd340fbfc7cb5faef004204c66e12bf2c0b))

# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0] - 2026-01-15

### Added

- 🏛️ Clean Architecture structure with domain, application, adapters layers
- 📦 ddd-kit package with Result, Option, Entity, Aggregate, ValueObject, UUID
- 🔐 Authentication with BetterAuth (sign up, sign in, sign out, sessions, email verification)
- 🔑 OAuth providers (Google, GitHub)
- 💳 Stripe integration (checkout, webhooks, customer portal)
- 📧 Email templates with Resend and React Email
- 🎨 UI components with shadcn/ui and Tailwind CSS 4
- 🤖 Claude Code skills: /eventstorming, /feature-prd, /gen-domain, /gen-usecase, /gen-tests
- 🤖 Claude Code agents: feature-architect, code-reviewer, test-writer, doc-writer
- 📊 Domain events system with typed payloads
- 🧪 BDD testing setup with Vitest (90%+ coverage)
- 📱 Expo mobile app with React Native
- 🔍 Quality tooling: jscpd, knip, Biome, Husky
- 📈 Sentry error tracking integration
- 🚀 Vercel deployment configuration

### Infrastructure

- Monorepo with Turborepo
- PostgreSQL with Drizzle ORM
- GitHub Actions CI/CD with Codecov
- Pre-commit hooks with lint-staged and commitlint

### Documentation

- CLAUDE.md with AI development guide
- Professional README with architecture overview
- Comprehensive test coverage

## [0.1.0] - 2024-12-01

### Added

- Initial project structure
- Basic auth implementation with BetterAuth
- ddd-kit primitives (Result, Option, Entity)
- Next.js 16 with App Router
- Drizzle ORM setup

---

[Unreleased]: https://github.com/axmusic/nextjs-clean-architecture-starter/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/axmusic/nextjs-clean-architecture-starter/releases/tag/v1.0.0
[0.1.0]: https://github.com/axmusic/nextjs-clean-architecture-starter/releases/tag/v0.1.0
