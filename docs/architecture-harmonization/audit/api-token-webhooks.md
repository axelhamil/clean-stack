# Audit: modules/api-token and modules/webhooks against target rules T1 to T13

Read-only. Paths are relative to `the repo root`. Line numbers refer to the working tree at `3bec6dba`. `apps/api/shape/` was only grepped, `pnpm check:*` was not run. Test counts come from `grep` on `it(`/`test(` and from the `.turbo/turbo-test.log` files (cached logs, not re-run).

## Places where the CURRENT guide (`modules/CLAUDE.md`) is followed but the target differs

| Current guide | Target | Seen in |
|---|---|---|
| `infrastructure/{repositories,services,http,crypto}` (open list) | `infra/{repos,adapters,http}` (T5) | both modules |
| `__TESTS__/` | `__tests__/` (T2) | both modules |
| `application/services/` is the default orchestration layer, `use-cases/` only where an aggregate exists | use case is the only application entry point, service = technical capability behind a port (T6) | `ApiTokenService`, `TokenLeakService`, `WebhooksService` |
| `application/dto/` global folder of `<verb-noun>.dto.ts` | DTO next to its use case (T4), HTTP schemas in the HTTP layer (T8) | both modules |
| `application/config/` typed settings | not listed in T4 | both modules |
| `application/ports/` holds interfaces, failure shape AND data records | records are fine, functions are not | `api-token.port.ts:60-77` holds `ownerReaches` and `tokenOwnerForSession` (logic) |
| Route "may read its own tables; writes through a service" (contract 6), route handlers may open transactions | T7: route calls use cases only, even reads | `webhooks.routes.ts`, `api-token.routes.ts` |
| Handlers `onEvent` with the write + `emitEvent` inline in the handler factory (the guide's own example, section "Domain events") | T10: handler only dispatches to use cases | `revoke-on-membership-lost.ts` is a literal copy of the guide example |
| Built-in subscribers live in the reacting module | T10 + T11 | `webhook-fanout-subscriber.ts` |
| `*.store.ts` vs `*.repository.ts` suffix tells aggregate or not | T3 has `.aggregate/.entity` only | neither module uses `*.store.ts` (both use `Drizzle*Repository` over anemic records) |
| `mappers/` only next to an aggregate | T4 allows `mappers/` generally, T12 wants centralised mappers | both modules, scattered mappers (point 9) |
| Host composes with `defineModule<...Prerequisites>()` and module exports factories | unchanged by target | conform |
| Module exports per-layer subpaths in `package.json` and the host imports deep paths (`@modules/api-token/domain/api-token-crypto`) | not addressed, but breaks when folders are renamed | see point 13 |
| `domain/` "only pure rules or ddd-kit primitives" | T13 domain depends on nothing | `api-token-crypto.ts` is not pure (point 11) |

---

## modules/api-token

### 1. Real responsibility
Issues personal access tokens (shown once, stored as HMAC under a server pepper), lets a member list and revoke them, and revokes a token when GitHub secret scanning reports a leak or when its owner loses the organization membership. Runtime authentication of a bearer token is NOT in the module: it is the host middleware `apps/api/src/shared/middleware/api-token.middleware.ts`.

### 2. Business or technical? Is a DDD domain justified?
Verdict: business module with a thin real lifecycle; a small domain is defensible but not strongly required. Honest reading:

Invariants found:
- Token lifecycle: live -> revoked once, reason in a closed set `user | membership_lost | leaked` (`api-token.port.ts:21,28`, `packages/events/src/payloads.ts:525`); a revoke on an already revoked token is a no-op (`api-token.service.ts:136`, `token-leak.service.ts:77`, repository `WHERE revokedAt IS NULL` at `drizzle-api-token.repository.ts:171`).
- Usability = not revoked AND not expired AND owner not deleted/banned. The first two are checked in the HOST (`api-token.middleware.ts:79-84`), outside the module.
- Max expiry (`api-token.service.ts:45`, `API_TOKEN_EXPIRY_INVALID`).
- Closed scope list `API_SCOPES` (`create-token.dto.ts:3`), enforced by Zod in a DTO, not by a type owned by the token.
- Raw token format: prefix + 44 base58 + 6 char CRC32 (`api-token-crypto.ts:5-66`).
- Visibility predicate `ownerReaches` (`api-token.port.ts:60`), duplicated in SQL (`drizzle-api-token.repository.ts:49`) and re-applied in the service (`api-token.service.ts:129,182`).
- Pepper rotation lookup order, implemented twice (`token-leak.service.ts:66-74`, `api-token.middleware.ts:62-87`).

Assessment: an `ApiToken` aggregate (`create`, `revoke(reason)`, `isUsable(now)`, `ownerReaches`) would own 3 of the rules that today are re-implemented in 4 places (service, leak service, handler, host middleware). That is a real, single-aggregate lifecycle with invariants, so DDD is justified at the "thin aggregate" level (1 aggregate, 1 id, 2 or 3 VOs: `TokenScope` list, `RawToken` format, `RevokedReason`). It is NOT a rich domain: the rest (HMAC, pepper, GitHub verifier, email) is technical. Per `modules/CLAUDE.md` Layers ("an entity has an invariant only it can enforce") it passes, barely, because `revoke` + `isUsable` + expiry are about one record. If the migration wants to minimise DDD, api-token is the weaker of the two candidates for dropping the domain, but the closest to a keep.

Today's `domain/` holds one file and no ddd-kit primitive: it is technically not a domain (an "empty domain" by the guide's own definition, `modules/CLAUDE.md` Folders section).

### 3. Current tree of `src/` (22 files total in the module: 13 source, 9 tests)
```
src/                                   (1 file at root)
  api-token.module.ts
  __TESTS__/                           9 files (8 test + layering)
  application/
    config/        1  api-token-settings.ts
    dto/           1  create-token.dto.ts
    event-handlers/1  revoke-on-membership-lost.ts
    ports/         2  api-token.port.ts, user-contact.port.ts
    services/      2  api-token.service.ts, token-leak.service.ts
  domain/          1  api-token-crypto.ts
  infrastructure/
    http/          2  api-token.routes.ts, scanning.routes.ts
    repositories/  1  drizzle-api-token.repository.ts
    services/      1  github-key-verifier.ts
```
Outside `src/`: `schemas/api-token.ts`, `scripts/check-api-token-visibility.ts`, `CLAUDE.md`, `package.json`, `tsconfig.json`.

### 4. Service vs use case
| File | Really is | Public methods | Would split into |
|---|---|---|---|
| `application/services/api-token.service.ts` (185 l) | use case orchestration (uow + repo + outbox + event), 4 independent actions | `create` (41), `revoke` (110), `revokeAllOfUser` (172), `list` (178) | 4 use cases: `create-api-token`, `revoke-api-token`, `revoke-all-user-tokens` (bound by the host as `IApiTokenRevoker` for rgpd, `composition/sources/rgpd.ts:44`), `list-api-tokens` |
| `application/services/token-leak.service.ts` (136 l) | use case orchestration (parse -> lookup with 2 peppers -> revoke+event -> email) | `handleReport` (36) + private `judge`, `findByRawToken`, `revokeLeaked`, `revokeAndAnnounce`, `warnOwner` | 1 use case `handle-leak-report` (calls email through the kit `IEmailService`); the "owner warning" could be an event handler on `API_TOKEN_REVOKED reason=leaked` |
| `infrastructure/services/github-key-verifier.ts` (130 l) | technical service / external integration (GitHub public keys, DER to P1363, WebCrypto verify, in-memory key cache) | `verify` | stays infra adapter, BUT has no contract: the route types it as `Pick<GithubKeyVerifier,"verify">` (`scanning.routes.ts:9`). Needs `application/ports/` interface (`ISecretScanSignatureVerifier`) |
| `domain/api-token-crypto.ts` | mixed: token format rules (domain) + HMAC and RNG (technical) | `generateToken`, `parseToken`, `hmacToken` | format/parse -> VO or domain service; HMAC and random generation -> port `ITokenHasher` + `infra/adapters` |

### 5. HTTP routes
| File | Route | Direct calls | Zod |
|---|---|---|---|
| `infrastructure/http/api-token.routes.ts` | `GET /` (l.40) | `ApiTokenService.list` (43), builds `TokenOwner` via port helper `tokenOwnerForSession` (42) | none needed |
| same | `POST /` (l.47) | org-mismatch rule inline (57-63), imperative guard call `requireTokenCreationInOrg(c, async () => {})` (64), then `ApiTokenService.create` (67) | body: `zV("json", createTokenBodySchema)` (52), `zV` from `@packages/http/validator`; `organizationId: z.string()` not an id format |
| same | `DELETE /:id` (l.80) | `ApiTokenService.revoke` (84) | `c.req.param("id")` (82) NOT validated |
| `infrastructure/http/scanning.routes.ts` | `POST /github` (l.18) | reads headers by hand (21-22, manual 403 on missing, no Zod), calls technical service `GithubKeyVerifier.verify` directly (28), hand `JSON.parse` (33), `scanPayloadSchema.safeParse` (38, not `zV`), then `TokenLeakService.handleReport` (41) | body: local `scanPayloadSchema` (13) via `safeParse`; headers not Zod-validated |

`as` casts on request data: none in the module. Related cast outside the module: `record.scopes as ApiScope[]` on persisted data in the host middleware (`api-token.middleware.ts:90`, caused by `scopes: string[]` in the record, `api-token.port.ts:14`).
T7/T8 gaps: scanning route calls a technical service (signature) and parses by hand (the order "403 before 400 on the raw body" is a documented trap in `modules/api-token/CLAUDE.md`, so a Zod-at-boundary migration must keep raw-body-first); `DELETE /:id` param unvalidated; org-mismatch decision and guard invocation sit in the route (62-64).

### 6. Event handlers
| Handler | What it does directly |
|---|---|
| `application/event-handlers/revoke-on-membership-lost.ts` (53 l), `onEvent(ORG_MEMBER_REMOVED, "revoke-api-tokens-on-membership-lost")` | Parses payload with `payloadParser` (20). Then itself: opens `ITransactionService.run` (28), calls `IApiTokenRepository.revokeAllForMembership` (29), loops and calls `emitEvent` per token (33-46). Pure logic + store write + emit, no use case. Needs a `revoke-tokens-on-membership-lost` use case; handler reduces to parse + dispatch. |

Host-side equivalent: usage recording (`touchLastUsed` + `API_TOKEN_USED`) is executed in the middleware (`api-token.middleware.ts:111-141`), not in a module handler.

### 7. Events emitted
| Event | Declared | Emitted | Reads as |
|---|---|---|---|
| `API_TOKEN_CREATED` | `packages/events/src/event-types.ts:46`, payload `payloads.ts:740` | `api-token.service.ts:78-93` (service via `emitEvent`) | domain fact (token created), emitted as application event today |
| `API_TOKEN_REVOKED` reason `user` | `event-types.ts:47` | `api-token.service.ts:145-158` | domain fact |
| `API_TOKEN_REVOKED` reason `leaked` | same | `token-leak.service.ts:92-105` | domain fact (actor null) |
| `API_TOKEN_REVOKED` reason `membership_lost` | same | `revoke-on-membership-lost.ts:33-46` (handler) | domain fact |
| `API_TOKEN_USED` | `event-types.ts:48` | host middleware `api-token.middleware.ts:117-130` | application event (usage telemetry), correctly NOT a domain event |
| (none) | n/a | `revokeAllOfUser` (`api-token.service.ts:172`) revokes N tokens with NO event in the module; the erasure flow emits its own (rgpd.service.ts:327 names `"api_token"`) | gap vs root rule 6, intentional per rgpd |

No event is emitted by an aggregate (none exists). Under the target, with an aggregate: CREATED and REVOKED become domain events in `domain/api-token/events/`; USED stays an application event.

### 8. Technical implementations in `application/`, ports
- `domain/api-token-crypto.ts` is technical in `domain/`: `import { createHmac } from "node:crypto"` (1), global `Bun.hash.crc32` (40, with `biome-ignore`), `crypto.getRandomValues` (18).
- `api-token.service.ts` uses `crypto.randomUUID()` (58) and `Date.now()`/`new Date()` (54, 70) directly: no id generator or clock port (webhooks uses `uuidv7` from ddd-kit instead).
- Ports present: `IApiTokenRepository` (`api-token.port.ts:79`), `IUserContactReader` (`user-contact.port.ts:11`). Kit ports via Prerequisites: instrumentation, outbox, uow, email.
- Ports missing: token hasher/generator (HMAC + RNG + checksum), GitHub signature verifier, clock/id.
- Port implementations: repository in `infrastructure/repositories/`, GitHub verifier has no port, `IUserContactReader` is implemented by the HOST (`apps/api/src/shared/services/drizzle-user-account.store.ts`) and bound under the host key name `IUserAccountStore` (`api-token.module.ts:19`, `container.ts:187`): the module's Prerequisites key is named after a host class, relying on structural typing (`UserContact` is declared twice: `user-contact.port.ts:5` and `apps/api/src/shared/ports/user-account.port.ts:5`).
- Business predicates living in the port file: `ownerReaches`, `tokenOwnerForSession` (`api-token.port.ts:60,70`) belong in domain (or a VO) under the target.

### 9. Scattered conversions that belong in mappers
- Row -> record: `toRecord` in repo (`drizzle-api-token.repository.ts:15`); record -> row inline in `insert` (67-81); `revokeAllOfUser` row mapping inline (232-237).
- Record -> JSON: `toTokenJson` in the routes file (`api-token.routes.ts:16`).
- Record built inline in `create` (`api-token.service.ts:57-71`).
- Event payload building, 5 copies: `api-token.service.ts:83-91`, `:150-156`; `token-leak.service.ts:97-103`; `revoke-on-membership-lost.ts:38-44`; host `api-token.middleware.ts:122-128`.
- Email template payload `token-leak.service.ts:127-131`; verdict build `:45-50`.

### 10. DTO locations
`application/dto/create-token.dto.ts` (single file): holds `API_SCOPES`, `ApiScope`, `createTokenBodySchema`. No `CreateTokenInput = z.infer` (the service has its own `CreateTokenServiceInput`, `api-token.service.ts:16`). `ApiScope` is imported by the host (`api-token.middleware.ts:1`, `public-api/require-scope.ts:1`), so this DTO file is really a domain constant (closed scope list) exported across the boundary. `scanPayloadSchema` lives in the HTTP file (`scanning.routes.ts:13`), the only HTTP-layer schema.

### 11. Layer violations and ddd-kit gaps
- T13: `domain/api-token-crypto.ts` imports `node:crypto` and Bun runtime (see 8). No other domain/application import of Drizzle, Hono or SDK found (`layering.test.ts` passes per `.turbo` log; application imports only kit packages `@packages/{ddd-kit,email,events,i18n,outbox}` and `zod`).
- No aggregate, no `*-id.ts`: ids are `string` everywhere (`ApiTokenRecord.id/userId/organizationId`, `api-token.port.ts:10-12`), against ddd-kit rule "identifier always typed".
- No VOs: scopes `string[]` (14), reason is a conditional type derived from `Option` (28-29, commented as an RPC inference workaround), token name plain string.
- Errors are plain `{code,message}` objects (`ApiTokenError`, `api-token.port.ts:3`), not `AppError<...>` (user-contact port uses `AppError`, `user-contact.port.ts:3`): inconsistent inside the module.
- `Result`/`Option` use is correct and consistent (ports return `Result<Option<T>,E>`, `Option.fromNullable` only in repository mapping).
- Business rule in the host: validity checks (`api-token.middleware.ts:79-84`), pepper fallback and rehash (62-88), scope check (92), user deleted/banned (96-103) = an "authenticate token" use case sitting in `apps/api`, importing the module's port and crypto directly. Layer-wise this is the largest gap: the host reads the repository with no use case in between.
- Transactions: services use `uow.run` correctly, repository reads `resolveExecutor()` outside the span callback. No tx parameter.

### 12. Folder and naming gaps (T2 to T5)
- `infrastructure/` -> `infra/`; `infrastructure/repositories/` -> `infra/repos/drizzle/`; `infrastructure/services/github-key-verifier.ts` -> `infra/adapters/`; `infrastructure/http/*.routes.ts` -> `infra/http/routes/<route>/<route>.ts` + `<route>.schema.ts` (2 routers: `api-token`, `scanning`).
- `__TESTS__` -> `__tests__` (9 files).
- `application/services/` (2) -> `application/usecases/<name>/<name>.usecase.ts` (5 use cases).
- `application/dto/` -> next to each use case; `application/config/` is outside T4's list.
- `application/event-handlers/revoke-on-membership-lost.ts`: right folder, wrong content, no `.handler` convention in target.
- `domain/api-token-crypto.ts` is a flat file in `domain/`, T3 wants `domain/<concept>/...`.
- Source root files: only `api-token.module.ts` plus folders (T2 conform apart from names).

### 13. Dependencies
- Packages (`modules/api-token/package.json`): ddd-kit, drizzle, email, events, http, i18n, outbox, drizzle-orm, hono, inwire, zod. No other module imported (grep `@modules/` in `src/` and `scripts/`: no hit).
- Prerequisites the host binds (`api-token.module.ts:14-21`, `composition/settings.ts:95`, `container.ts`): `IInstrumentation`, `IOutboxRepository`, `ITransactionService`, `IEmailService`, `IUserAccountStore` (as `IUserContactReader`), `apiTokenSettings`.
- Host consumes (grep under `apps/api`):
  - `container.ts:2,209` `apiTokenModule`.
  - `app.ts:10-11` imports `createApiTokenRoutes`, `createApiTokenScanningRoutes`; mounts at `app.ts:256` (`/api/token-scanning`) and `app.ts:271` (`/settings/tokens`); `app.ts:236` passes `di.IApiTokenRepository` to `createPublicApiV1`.
  - `shared/middleware/api-token.middleware.ts:1-3` (ApiScope, IApiTokenRepository, `hmacToken`, `parseToken`).
  - `public-api/require-scope.ts:1` (`ApiScope`).
  - `composition/settings.ts:3` (`ApiTokenSettings`).
  - `composition/sources/rgpd.ts:9,33,44`: `ApiTokenService` bound as `IApiTokenRevoker` (port declared in `modules/rgpd/src/application/ports/api-token-revoker.port.ts`, used at `drizzle-rgpd.repository.ts:370`).
  - Tests/scripts: `shared/__TESTS__/api-token.middleware.test.ts:2-3`, `public-api/__TESTS__/boundary.test.ts:5-6`, `scripts/check-wipe-rollback.ts:37-39` (imports `DrizzleApiTokenRepository` and schema).
- Events of other modules reacted to: `ORG_MEMBER_REMOVED` (`revoke-on-membership-lost.ts:22`), subscribed by type, found by `collectUserEventHandlers` over container keys (`packages/outbox/src/event-handlers.ts:44`).
- Tables read but not owned: none beyond FKs to kit tables `user` and `organization` (`schemas/api-token.ts:1-2`, allowed as kit).
- `package.json` exports (12): `api-token.module`, `application/config/api-token-settings`, `application/dto/create-token.dto`, `application/ports/api-token.port`, `application/services/api-token.service`, `application/services/token-leak.service`, `domain/api-token-crypto`, `infrastructure/repositories/drizzle-api-token.repository`, `infrastructure/services/github-key-verifier`, `infrastructure/http/api-token.routes`, `infrastructure/http/scanning.routes`, `schemas/*`. Exports with no importer outside the module: `token-leak.service`, `github-key-verifier` (both reached through the container only), so these two can disappear from `exports`. Every folder rename changes 8 host import paths.

### 14. Tests and migration risks
- 9 test files, 67 tests (`.turbo/turbo-test.log`, 67 pass): `api-token.crypto` 6, `api-token.service` 13, `drizzle-api-token.repository` 12 (mocks Drizzle builders, so does not prove the WHERE), `github-key-verifier` 8, `revoke-on-membership-lost` 5, `routes` 8, `scanning.routes` 5, `token-leak.service` 9, `layering` 1.
- Real-database check: `scripts/check-api-token-visibility.ts` (script `check:api-token-visibility`), proves `visibleTokensFilter`; wired in CI (`apps/api/CLAUDE.md`).
- Host tests that import the module internals: `api-token.middleware.test.ts`, `boundary.test.ts`, `check-wipe-rollback.ts` (a real-DB check that instantiates `DrizzleApiTokenRepository`).
- Frozen API shape: `apps/api/shape/routes.txt` lines 10, 47, 70, 92 (`DELETE/GET/POST /settings/tokens`, `POST /api/token-scanning/github`) and `app-type.d.ts.snap:966`. Response JSON (`toTokenJson`, `api-token.routes.ts:16`) types feed the front through Hono RPC; the comment at `api-token.port.ts:25-27` warns that `revokedReason` must stay a literal union.
- External contracts: token wire format (prefix + 44 + 6 CRC32) and HMAC digest base64url; GitHub signature headers and payload; stored `token_hmac`, `pepper_version`, `token_start` columns; event payload shapes in `packages/events`. Moving the crypto must stay bit-identical (6 crypto tests + host tests build tokens with `generateToken`).
- Risks: (1) the host middleware is the real authentication path and is not under module tests; moving it into a use case changes `apps/api` hot path and its rate-limit ordering (`apiTokenId` must be set before per-token policy, middleware l.105); (2) `Bun.hash.crc32` swap would alter checksum if reimplemented; (3) `layering.test.ts` (`assertModuleLayering`) encodes the current folder names and may need updating for `infra/`.

### 15. Verdict
Partially conform. Business rules, `Result`/`Option`, instrumentation, ambient transaction, ownership in the WHERE and typed events are in place; layering of "who calls what" and folder naming are not. Effort: **M** (about 13 source files, 8 host import sites, one real-DB check to keep green).

Ordered corrections:
1. Decide domain: thin `domain/api-token/` (aggregate + id + `TokenScope`/`RawToken`/`RevokedReason` VOs + 2 domain events) or stay flat (then rename `domain/` away; today it is an impure single file).
2. Remove impurity from `domain/api-token-crypto.ts`: `ITokenHasher` port (HMAC, RNG, CRC32) in `application/ports/`, impl in `infra/adapters/`; keep parse/format rules in the domain.
3. Add `IGithubKeyVerifier` port; route and use case depend on it.
4. Split the two services into 5 use cases (`create`, `revoke`, `revoke-all-user`, `list`, `handle-leak-report`), DTO beside each; host binds `IApiTokenRevoker` to the revoke-all use case.
5. Make the membership handler dispatch to a use case.
6. Move host middleware logic (validity, pepper fallback, rehash, scopes, usage event) into `authenticate-api-token` + `record-token-usage` use cases; middleware keeps only Hono glue. Biggest behavioural-risk item.
7. Routes: `zV("param")` on `:id`, `zV("header")`/raw-body flow on scanning, move org-mismatch/permission decision into the use case or a guard, move `toTokenJson` to a mapper beside the route; centralise event-payload and row mappers.
8. Typed ids (`ApiTokenId`), `AppError` for `ApiTokenError`, `uuidv7` + clock port.
9. Rename `infrastructure -> infra`, `repositories -> repos/drizzle`, `services -> adapters`, `__TESTS__ -> __tests__`, regroup routes per T5; update `package.json` exports, 8 host imports, `layering.test.ts` expectations.
10. Replace `UserContact` duplicate and the `IUserAccountStore` key name by a module-named prerequisite (`IUserContactReader`).

---

## modules/webhooks

### 1. Real responsibility
Lets an organization register outbound webhook endpoints (secret sealed per organization, SSRF-guarded URL), fans every public catalog event out into one `webhook_delivery` row per matching endpoint, and delivers them signed (HMAC) from a polling worker with a lease, retries, dead letters, replay and auto-disable of failing endpoints.

### 2. Business or technical? Is a DDD domain justified?
Verdict: technical / orchestration module. A DDD domain is NOT justified.

Invariants found and where they live:
- Secret sealing XChaCha20-Poly1305 with HKDF sub-key per org: `infrastructure/crypto/aead.ts:23-41`. Crypto, infra.
- Secret grace window and dual signature: `webhooks.service.ts:372-374` (computing expiry), `webhook-delivery-worker.service.ts:290-310` (selecting live secrets), `hmac-signer.ts:15-29`. Time arithmetic on columns.
- SSRF rules (scheme, credentials, private ranges incl. IPv4-mapped, DNS timeout): `ssrf-guard.ts:31-101`. Technical adapter behind `IUrlGuard`.
- Auto-disable rule `consecutiveFailures >= min && firstFailedAt older than N days`: `webhook-delivery-worker.service.ts:78-87`, a 3 line pure function; counters are bumped atomically in SQL (`bumpFailure` in the endpoint repository).
- Delivery state machine (pending/failed/dead_letter/success, max 4 attempts, lease): `webhook-delivery-worker.service.ts:41,389-409`, `@packages/outbox` `failureSchedule`, `lease-budget`. This is queue bookkeeping, which the root `CLAUDE.md` rule 6 explicitly says is not a business state change.
- Ownership: `organizationId` in repository WHERE (`modules/webhooks/CLAUDE.md` invariant 5).
- Fan-out matching: `matchesSubscription` from `@packages/events` plus an `ON CONFLICT DO NOTHING` key (`webhook-fanout-subscriber.ts:39-59`): a config lookup + insert.

Every rule fits `includes()`, a column comparison, a config constant or an SQL counter; per `modules/CLAUDE.md` ("Do I need an aggregate?") that is infra orchestration. An `Endpoint` aggregate could be drawn (url, eventTypes, enabled, rotate secret, disable), but its methods would be setters over columns with the real work (SQL counters, lease claim) in repositories. Keep Clean Architecture without `domain/` (T1: "technical or orchestration module (webhooks plumbing) has no `domain/`"). At most extract `shouldAutoDisable` and the event envelope as pure helpers in `application/`.

### 3. Current tree of `src/` (31 files in the module: 20 source, 11 tests)
```
src/                                   (1 file at root)
  webhooks.module.ts
  __TESTS__/                           11 files (10 test + layering)
  application/
    config/    1  webhook-settings.ts
    dto/       4  create-endpoint.dto.ts, update-endpoint.dto.ts, list-deliveries.dto.ts, _event-types.ts
    ports/     4  secret-cipher.port.ts, url-guard.port.ts, webhook-delivery.port.ts, webhook-endpoint.port.ts
    services/  1  webhooks.service.ts
  infrastructure/
    crypto/        2  aead.ts, aead-secret-cipher.ts
    http/          1  webhooks.routes.ts
    repositories/  2  drizzle-webhook-delivery.repository.ts, drizzle-webhook-endpoint.repository.ts
    services/      4  hmac-signer.ts, ssrf-guard.ts, webhook-delivery-worker.service.ts, webhook-fanout-subscriber.ts
```
Outside `src/`: `schemas/webhooks.ts` (3 tables: endpoint, delivery, delivery attempt), `scripts/check-webhook-lease.ts`, `CLAUDE.md`. No `domain/` (conform with the verdict).

### 4. Service vs use case
| File | Really is | Public methods | Would split into |
|---|---|---|---|
| `application/services/webhooks.service.ts` (414 l) | use case orchestration (uow + repos + outbox + guard + cipher), plus pass-through reads | 11: `createEndpoint` (53), `updateEndpoint` (134), `deleteEndpoint` (181), `listEndpoints` (206), `findEndpoint` (215), `listDeliveries` (225), `countDeadLetters` (238), `findDelivery` (245), `replayDelivery` (261), `sendTest` (299), `rotateSecret` (341) | 11 use cases (the four pure reads `listEndpoints`, `findEndpoint`, `listDeliveries`, `findDelivery` each wrap a single repo call and carry only a span); `countDeadLetters` is bound by the host to admin's `IDeadWebhookReader` (`admin.module.ts:68`, key `WebhooksService`). Contains technical bits: `defaultSecretGenerator` with `crypto.getRandomValues` + `node:buffer` (410-414, import l.1) should be a port; `MasterKeyProvider` type declared here (30) belongs in `ports/`. |
| `infrastructure/services/webhook-delivery-worker.service.ts` (544 l) | three things in one class: (a) infra scheduler (timer, drain loop, stop, lease countdown: 115-232), (b) delivery use case (`processDelivery`: endpoint lookup, URL re-guard, secret decrypt, body+headers build, signing, fetch, capped body read: 251-387), (c) settle/outcome use case (`settle`, `failureOf`, `runTerminalFailureBlock`: markFailed/markSuccess, attempt log, bump/reset endpoint failures, auto-disable, 2 emitted events: 389-543) | `start`, `stop` (+ private `drain`, `drainBatch`, `processDelivery`, `settle`, ...) | infra poller (keep in `infra/`); use cases `deliver-webhook` and `settle-delivery` (or `record-delivery-outcome`); ports for HTTP sender (`fetch`), signer, secret opener (`ISecretCipher` only has `seal`, `secret-cipher.port.ts`; the worker imports `decryptSecret`/`deriveOrgSubKey` from infra directly). `*.service.ts` suffix is misleading: it is a background job runner. |
| `infrastructure/services/webhook-fanout-subscriber.ts` (72 l) | event handler holding persistence logic (see 6) | `handle` | handler + use case `fan-out-event-to-endpoints` + repo ports |
| `infrastructure/services/ssrf-guard.ts` | technical adapter of `IUrlGuard` | `assertPublicUrl`, `dnsUrlGuard` | stays `infra/adapters/` (conform: port exists, `url-guard.port.ts`) |
| `infrastructure/services/hmac-signer.ts` | technical adapter, no port | `signWebhookPayload`, `isStaleTimestamp` (unused by the module, documented trap) | `infra/adapters/` behind a `IWebhookSigner` port |
| `infrastructure/crypto/aead.ts`, `aead-secret-cipher.ts` | technical adapter of `ISecretCipher` (seal only) | `masterKeyFromHex`, `deriveOrgSubKey`, `encryptSecret`, `decryptSecret`, `aeadSecretCipher`, `masterKeyProvider` | `infra/adapters/`; extend port with `open`, make master key a port |

### 5. HTTP routes (`infrastructure/http/webhooks.routes.ts`, 292 l, 9 handlers)
| Route | Direct calls | Zod |
|---|---|---|
| `GET /` (l.69) | `listEndpoints` (76); mapper `toEndpointJson` (34) | none |
| `POST /` (l.81) | `createEndpoint` (92) | body `zV("json", createEndpointBodySchema)` (88) |
| `PATCH /:id` (l.104) | `updateEndpoint` (116); throws `HTTPException(404)` (124) | body `zV("json", updateEndpointBodySchema)` (111); `:id` via `c.req.param` (114) unvalidated |
| `DELETE /:id` (l.128) | `deleteEndpoint` (138); `HTTPException(404)` (141) | `:id` unvalidated (137) |
| `GET /:id/deliveries` (l.145) | `findEndpoint` (154) THEN `listDeliveries` (159): two service calls = orchestration in the route | query `zV("query", listDeliveriesQuerySchema)` (150); `:id` unvalidated (153) |
| `GET /:id/deliveries/:deliveryId` (l.174) | `findEndpoint` (183) THEN `findDelivery` (187), plus a 27 line inline response mapper (192-218) | no `zV` at all; both params unvalidated (181-182) |
| `POST /:id/test` (l.222) | `sendTest` (232) | `:id` unvalidated (231) |
| `POST /:id/rotate-secret` (l.243) | `rotateSecret` (253) | `:id` unvalidated (252) |
| `POST /:id/deliveries/:deliveryId/replay` (l.265) | `findEndpoint` (276) THEN `replayDelivery` (280) | both params unvalidated (274-275) |

No handler touches a repository, ORM or transaction directly (route is clean on that point). Validator everywhere is `zV` from `@packages/http/validator`. Params: 0 of 9 handlers validate `:id`/`:deliveryId` (they are not UUID-checked, any string reaches the repository). No `as` cast on request data. Absence is mapped to `HTTPException(404, "Webhook ... not found")` in 7 places (124, 141, 157, 186, 190, 239, 260, 279, 288) in the route instead of a typed `*_NOT_FOUND` code, which is the inverse of the guide ("absence of owner = NOT_FOUND write, `Option.none()` read" mapped by the central handler). The pre-check `findEndpoint` (3 routes) is an existence/ownership guard that belongs inside the use cases.

### 6. Event handlers
| Handler | What it does |
|---|---|
| `WebhookFanoutSubscriber` (`infrastructure/services/webhook-fanout-subscriber.ts`), `BuiltInEventHandler` named `webhook-fanout`, subscribed to every catalog type by `buildEventDispatcher` (`container.ts:236`) | All directly, no use case, no repository: filters on `organizationId`/`isPublicEvent` (26-27), opens `uow.run` (29), reads `webhookEndpoint` with Drizzle `exec.select()` (31-34), filters by `matchesSubscription` (39), builds delivery rows with `uuidv7`, `dbNow`, idempotency key (44-58), `INSERT ... ON CONFLICT DO NOTHING` (59), wraps in spans, captures and rethrows (65-67). Bypasses both repositories (`IWebhookEndpointRepository`, `IWebhookDeliveryRepository`) that already exist. Violates T10 and T13 intent (infra reaching ORM directly is allowed in infra, but the handler should delegate to a use case). |

No `onEvent` handlers in this module (so the module reacts to no specific event type, only to all public ones through the built-in).

### 7. Events emitted
| Event | Declared | Emitted | Reads as |
|---|---|---|---|
| `WEBHOOK_ENDPOINT_CREATED` | `packages/events/src/event-types.ts:38`, payload `payloads.ts:687` | `webhooks.service.ts:94` | domain fact (application event today) |
| `WEBHOOK_ENDPOINT_UPDATED` | `:39` | `webhooks.service.ts:162` (payload `changes` built 158-161) | idem |
| `WEBHOOK_ENDPOINT_DELETED` | `:40` | `webhooks.service.ts:193` | idem |
| `WEBHOOK_ENDPOINT_SECRET_ROTATED` | `:42` | `webhooks.service.ts:385` | idem |
| `WEBHOOK_DELIVERY_REPLAYED` | `:45` | `webhooks.service.ts:280` | application event |
| `WEBHOOK_TEST` | `:41` | `webhooks.service.ts:311` (emitted and a targeted delivery enqueued in the same uow, 310-336) | application event |
| `WEBHOOK_DELIVERY_EXHAUSTED` | `:44` | worker `runTerminalFailureBlock` (`webhook-delivery-worker.service.ts:490`), `actorUserId: null` | application event (queue bookkeeping, announced once) |
| `WEBHOOK_ENDPOINT_DISABLED` | `:43` | worker (`:529`), `actorUserId: null` | domain-like fact, emitted by a worker class in infra |

All 8 go through `emitEvent(outbox, ...)`; no aggregate emits. Under the target (no domain), all are application events in `application/events/` emitted by use cases; the two worker emissions move into the `settle-delivery` use case.

### 8. Technical implementations in `application/`, ports
- `application/services/webhooks.service.ts`: `node:buffer` import (1) and `crypto.getRandomValues` secret generation (410-414); `MasterKeyProvider` type (30) is a port living in a service file and imported by infra (`aead-secret-cipher.ts:3`, `webhook-delivery-worker.service.ts:35`): infra importing a service file from application.
- Ports present: `IWebhookEndpointRepository`, `IWebhookDeliveryRepository`, `IUrlGuard`, `ISecretCipher` (seal only). Kit ports via Prerequisites.
- Ports missing: master key provider, secret generator, signer, HTTP sender (worker takes `fetchImpl` ad hoc, `webhook-delivery-worker.service.ts:132`), clock for `Date.now()`/`new Date()` (several, e.g. 298, 318, 333, 518), event fan-out contract, `ISecretCipher.open`.
- Implementations: repositories in `infrastructure/repositories/`, URL guard in `infrastructure/services/ssrf-guard.ts`, cipher in `infrastructure/crypto/`. Composition: `webhooks.module.ts:51` passes the infra constant `aeadSecretCipher` imported directly (not via the container); `WebhooksService` also takes `secretGen` as an optional 11th constructor arg defaulting to an application function.
- Host contract by key name: admin binds `WebhooksService` (key) to `IDeadWebhookReader` (`modules/admin/src/admin.module.ts:68`), so the key name and `countDeadLetters` signature are a cross-module contract.

### 9. Scattered conversions that belong in mappers
- Row -> record: `toRecord` (endpoint repo `:21`; delivery repo `:91`), `toAttemptRecord` (delivery repo `:108`).
- Record -> JSON: `toEndpointJson` (`webhooks.routes.ts:34`), `toDeliveryJson` (`:50`), inline attempt/delivery mapper (192-218), response composition with `secret` in `POST /` (101) and rotate (262).
- Event payloads, 8 inline builders: `webhooks.service.ts:100-107`, `:168-172` (+ `changes` 158-161), `:198`, `:286-291`, `:316-320`, `:390-394`; worker `:495-502`, `:534-540`.
- Outbound webhook envelope `{id,type,data,time}` and 5 request headers built inline in the worker (`webhook-delivery-worker.service.ts:312-327`); `DeliveryFailure` mapping (`failureOf`, 389-409); attempt log construction (365-379 and 272-283).
- Fan-out row building (`webhook-fanout-subscriber.ts:47-57`).

### 10. DTO locations
`application/dto/` (4 files): `create-endpoint.dto.ts`, `update-endpoint.dto.ts`, `list-deliveries.dto.ts`, `_event-types.ts` (shared refinement, name without `.dto` suffix and with underscore). These are HTTP request schemas sitting in `application/` (T8: should be in the HTTP layer; T4: DTO next to its use case). `list-deliveries.dto.ts:3` re-declares `WEBHOOK_DELIVERY_STATUSES` while `webhook-delivery.port.ts:4` re-declares the same union as a type (two sources of truth). `webhook-endpoint.dto.test.ts` (9 tests) covers the schemas. No `*Input = z.infer` types: services take hand-written inline arg types (`webhooks.service.ts:53-59, 134-141, 225-231, 299-303, 341-345`).

### 11. Layer violations and ddd-kit gaps
- No Drizzle, Hono or SDK import from `application/` (confirmed by imports of `webhooks.service.ts`, ports, dto; `layering.test.ts` passes per `.turbo` log). Only `node:buffer` and the global `crypto` in the service.
- Infra layer reaches the ORM directly in the fan-out subscriber, bypassing ports (6).
- Worker (infra) contains business policy (retry schedule, terminal failure rule, auto-disable, event emission, secret selection by grace window); it should sit in `application/` use cases with the loop in `infra/`.
- Records are anemic types with `string` ids (`webhook-endpoint.port.ts:6-7`, `webhook-delivery.port.ts:21-22`): no typed ids, no VOs (event type selectors `string[]`, url `string`, secret cipher `string`), no `Aggregate`/`Entity`. Consistent with "no domain" verdict; ddd-kit used only for `Result`, `Option`, `AppError`, `uuidv7`, `createDbFailure`.
- Good: repositories use `createDbFailure("WEBHOOK_PERSISTENCE_PROVIDER_FAILURE", logger)`, `AppError` typed errors (`WebhookRepoError`), `Option` in records and ports, ambient transaction, ownership in WHERE.
- Casts: `ssrf-guard.ts:26-27` `hex[1] as string` / `hex[2] as string` (regex groups, not request data).
- Time and randomness read ambiently in application and infra (no clock port), which makes the 722-line worker test depend on injected `clock` only for lease.

### 12. Folder and naming gaps (T2 to T5)
- `infrastructure/` -> `infra/`; `repositories/` -> `repos/drizzle/`; `services/` and `crypto/` -> `adapters/`; `http/webhooks.routes.ts` -> `infra/http/routes/<route>/<route>.ts` + `.schema.ts` (one router today carrying 9 handlers; T5 asks per-route folders, so up to 9 or grouped by resource: `endpoints`, `deliveries`).
- `__TESTS__` -> `__tests__` (11 files).
- `application/services/webhooks.service.ts` -> `application/usecases/*` (11); `application/dto` -> beside use cases or `infra/http`; `application/config/` outside T4.
- Misnamed by suffix: `webhook-delivery-worker.service.ts` (a job runner), `webhook-fanout-subscriber.ts` (an event handler, T10 wants `application/event-handlers/`), `_event-types.ts`.
- Root of `src/` conform apart from the missing `domain/` (correct).

### 13. Dependencies
- Packages (`modules/webhooks/package.json`): `@noble/ciphers`, `@noble/hashes`, ddd-kit, drizzle, events, http, outbox, hono, inwire, zod (plus others at lines 30+ not displayed). `@packages/http/private-ranges` used by `ssrf-guard.ts:4`. No `@modules/*` import in `src/` or `scripts/` (grep: no hit).
- Prerequisites the host binds (`webhooks.module.ts:16-22`): `IInstrumentation`, `ILogger`, `ITransactionService`, `IOutboxRepository`, `webhookSettings` (`composition/settings.ts:112-120`; env keys `WEBHOOK_MASTER_KEY`, `WEBHOOK_SECRET_GRACE_HOURS`, `WEBHOOK_LEASE_SECONDS`, `WEBHOOK_DEAD_RETRY_HOURS`, `WEBHOOK_AUTO_DISABLE_MIN_FAILURES`, `WEBHOOK_AUTO_DISABLE_AFTER_DAYS`, `WEBHOOK_RESPONSE_CAPTURE_BYTES`; `httpsOnly` too).
- Host consumes (grep under `apps/api`):
  - `container.ts:12,213` `webhooksModule`; `container.ts:236` `c.WebhookFanoutSubscriber` into `buildEventDispatcher` built-ins.
  - `index.ts:33,74` `di.WebhookDeliveryWorker.start()` / `.stop()`.
  - `app.ts:21,272` `createWebhooksRoutes` mounted at `/settings/webhooks`.
  - `app.ts:282` and `index.ts:44` re-export `WebhookDeliveryStatus` type from `application/ports/webhook-delivery.port` (consumed by the front through the api package).
  - `shared/env-bounds.ts:6` and `shared/__TESTS__/env-bounds.test.ts:6`, `composition/settings.ts:14`: `webhook-settings` constants/types.
  - `shared/internal-routes/sweep-webhook-delivery.route.ts:3,12-24`: the host reads and deletes from the module-owned table `webhook_delivery` directly through `@modules/webhooks/schemas/webhooks` (retention sweep). `scripts/check-outbox-lease.ts:22` also reads the schema.
  - Cross-module: `modules/admin/src/admin.module.ts:68` expects container key `WebhooksService` implementing `IDeadWebhookReader` (admin declares the port, host binds by key name).
  - `apps/api/scripts/__TESTS__/type-text.test.ts:52` holds a stale string literal `@modules/webhooks/application/ports/webhook.port` (fixture text only, file does not exist).
- Events of other modules: none by `onEvent`; the fan-out reacts to ALL public catalog events (`isPublicEvent`, `webhook-fanout-subscriber.ts:27`).
- Tables read not owned: `organization` and `outbox_event` via FK references in `schemas/webhooks.ts:1-2` (kit tables). Reads only its own tables otherwise.
- `package.json` exports (11 + schemas): `webhooks.module`, `application/config/webhook-settings`, `application/ports/{webhook-delivery,webhook-endpoint,url-guard}.port`, `application/services/webhooks.service`, `infrastructure/repositories/drizzle-webhook-delivery.repository`, `infrastructure/services/{webhook-delivery-worker.service,webhook-fanout-subscriber}`, `infrastructure/http/webhooks.routes`, `schemas/*`. Importers outside the module exist only for `webhooks.module`, `webhook-settings`, `webhook-delivery.port`, `webhooks.routes`, `schemas/*`; the other 6 exports (`webhook-endpoint.port`, `url-guard.port`, `webhooks.service`, delivery repo, worker, fan-out) have no importer and exist for the container's inferred type (TS2883 rule in `modules/CLAUDE.md` contract 1).

### 14. Tests and migration risks
- 11 test files, 192 tests (`.turbo` log; my `grep` count of `it(`/`test(` is 190 + layering): `aead` 11, `drizzle-webhook-delivery.repository` 26, `drizzle-webhook-endpoint.repository` 31, `hmac-signer` 13, `routes` 6, `ssrf-guard` 14, `webhook-delivery-worker.service` 29 (722 l), `webhook-endpoint.dto` 9, `webhook-fanout-subscriber` 3, `webhooks.service` 47 (1074 l), `layering` 1.
- Real-database check: `scripts/check-webhook-lease.ts` (362 l, `check:webhook-lease`) proves the lease budget (DNS + fetch + margin) against the worker; also `apps/api/scripts/check-outbox-lease.ts` reads the schema. Both wired in CI.
- Frozen API shape: `apps/api/shape/routes.txt` lines 11, 48-50, 53, 93-96 (`DELETE /settings/webhooks/:id`, `GET /settings/webhooks`, `/:id/deliveries`, `/:id/deliveries/:deliveryId`, `PATCH /:id`, `POST /`, `POST /:id/deliveries/:deliveryId/replay`, `POST /:id/rotate-secret`, `POST /:id/test`) and `app-type.d.ts.snap:897`. Param validation (`zV("param")`) and 404 mapping changes can alter the `AppType` input types and the 404 body: treat as contract drift until proven structural.
- External contracts: signature header `x-webhook-signature: t=<ts>,v1=<hex>[,v1=...]` over `<ts>.<body>`, headers `x-webhook-event-id|event-type|idempotency`, body envelope `{id,type,data,time}` (`webhook-delivery-worker.service.ts:312-327`), cipher layout `base64(nonce24 || ct+tag)` and HKDF info string `webhook-secret:<orgId>` (stored secrets in DB must stay decryptable), delivery idempotency key `<eventId>:<endpointId>`, retention sweep host route.
- Risks: (1) splitting the worker changes where the lease budget is enforced (`unitsWithinLease`, `claimLimit` computed in the constructor, l.135) and must keep `check:webhook-lease` green; (2) the test for `WebhooksService` is 1074 lines and will have to be split per use case (47 tests); (3) the container key names `WebhooksService` (admin), `WebhookFanoutSubscriber` and `WebhookDeliveryWorker` (host) are consumed by name, a rename breaks `container.ts`, `index.ts`, `admin.module.ts`; (4) `layering.test.ts` encodes folder names.

### 15. Verdict
Partially conform. Technical module without domain is the right shape; repository instrumentation, ambient tx, ownership-in-WHERE, typed errors and URL guard port are solid. Gaps are layer placement (policy in an infra worker, handler with raw ORM, routes orchestrating two calls), missing ports and naming. Effort: **L** (20 source files, 3 large classes to split, 9 routes, 192 tests to redistribute, 4 host consumption sites plus the admin key contract, lease check to keep green).

Ordered corrections:
1. Decide and document: no `domain/`; keep Clean Architecture only.
2. Add missing ports first (non-breaking): `IMasterKeyProvider`, `ISecretGenerator`, `ISecretCipher.open`, `IWebhookSigner`, `IWebhookSender`, `IClock`; move `MasterKeyProvider` out of the service file.
3. Fan-out: add `listEnabledByOrg` (endpoint repo) and `enqueueMany` (delivery repo) to the existing ports, create `fan-out-event-to-endpoints` use case, make the subscriber a thin `application/event-handlers/` dispatcher.
4. Split `WebhooksService` into 11 use cases with DTO beside; fold the `findEndpoint` pre-checks of 3 routes into the use cases (`list-deliveries`, `get-delivery`, `replay-delivery` return a typed `WEBHOOK_ENDPOINT_NOT_FOUND`/`WEBHOOK_DELIVERY_NOT_FOUND` mapped by the central handler, or `Option` as today with a shared helper). Keep the container key `WebhooksService` alive (or a thin facade) until admin's binding is moved.
5. Split the worker: `infra` poller keeps timer, drain loop, lease countdown; `deliver-webhook` and `settle-delivery` become use cases; move `shouldAutoDisable` and the retry decision to `application/`; the two emitted events move with them.
6. Routes: `zV("param")` for `:id` and `:deliveryId` on 9 handlers (check `api-shape` impact), response mappers (`toEndpointJson`, `toDeliveryJson`, attempt history) to a mapper file; HTTP schemas into `infra/http/routes/*/*.schema.ts`; keep `previous/secretCipher` stripped from JSON.
7. Centralise mappers for row, JSON and event payloads (point 9); unify `WEBHOOK_DELIVERY_STATUSES` source.
8. Rename `infrastructure -> infra`, `repositories -> repos/drizzle`, `services|crypto -> adapters`, `__TESTS__ -> __tests__`; update `package.json` exports, the 5 host import sites, admin's key contract, `layering.test.ts`, the stale literal in `type-text.test.ts:52`.
9. Re-run `check:webhook-lease`, `check:outbox-lease`, `check:api-shape`, boundaries, jscpd (the 8 inline event-payload builders and 11 span wrappers are duplication candidates).

---

## Cross-module comparison (for the migration plan)

| Aspect | api-token | webhooks |
|---|---|---|
| Domain justified | thin aggregate defensible (lifecycle + usability + visibility), currently fake `domain/` with 1 impure file | no, technical plumbing |
| Services to split | 2 (5 use cases) | 1 service (11 use cases) + 1 worker (2 use cases + poller) + 1 handler (1 use case) |
| Business logic outside the module | host middleware `api-token.middleware.ts` (145 l) | none; but policy inside infra worker |
| Routes with unvalidated params | 1 of 3 (`DELETE /:id`) + scanning headers | 9 of 9 |
| Event handlers doing work inline | 1 | 1 (built-in) |
| Missing ports | hasher/generator, GitHub verifier, clock/id | master key, generator, signer, sender, clock, cipher.open |
| Tests | 67 across 9 files | 192 across 11 files |
| Real-DB checks | `check:api-token-visibility` | `check:webhook-lease` (+ host `check:outbox-lease`) |
| Frozen shape entries | 4 route lines | 9 route lines |
| Effort | M | L |
