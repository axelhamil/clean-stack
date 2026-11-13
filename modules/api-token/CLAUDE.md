# api-token module rules

Personal access tokens for `/api/v1` and their revocation when GitHub reports a leak. Auto-loaded under `modules/api-token/`; module contract: `modules/CLAUDE.md`. The host side (`requireApiToken`, `requireScope`, the `/api/v1` mount) is in `apps/api`.

## Invariants

1. **A token is shown once and stored only as an HMAC under a server pepper.** `create` is the only path that returns the raw value; the row keeps `tokenHmac`, `pepperVersion` and a display prefix. **Why**: a read of the database must never yield a usable credential.
2. **The format is checked before any database call**: prefix, 44 base58 characters, 6 character CRC32 checksum (`RawToken.parse` in `domain/api-token/value-objects/raw-token.vo.ts`). Every reader of a raw token (the host middleware, the leak report) parses it first. **Why**: the checksum is the cost barrier, a malformed or guessed token must not cost a round trip.
3. **Visibility is one predicate, `ownerReaches`, transcribed in SQL as `visibleTokensFilter`.** Every owner read (`findByIdForOwner`, the list query) filters with `visibleTokensFilter` in its `WHERE`; the list query also re-applies `ownerReaches` to the rows it maps, and revoke relies on the `WHERE` of `findByIdForOwner`. A token out of the caller's reach is `API_TOKEN_NOT_FOUND`, never a 403. **Why**: a 403 would confirm the token exists. `check:api-token-visibility` proves the predicate, the real list query and `findByIdForOwner` against Postgres.
4. **Pepper rotation reads the current pepper, then the previous one.** The host middleware rehashes a token found through the previous pepper only after the revoked and expired checks passed. **Why**: no write is ever made for a token that is refused anyway. A new reader of raw tokens keeps the same lookup order.
5. **`API_SCOPES` is the closed list of scopes.** A missing scope is 403 (the bearer is authenticated), an unknown, malformed, revoked or expired token is 401. Adding a scope means the enum, `requireScope` on the route and a public-api test.

## Events emitted

The `ApiToken` aggregate builds `API_TOKEN_CREATED` and `API_TOKEN_REVOKED` in `create` and `revoke`; the repository hands them to the unit of work only once its write touched a row, so a revoke that lost a race announces nothing. The bulk membership revocation has no aggregate in memory and builds its events from the rows the `UPDATE` returned.

- `API_TOKEN_CREATED` and `API_TOKEN_REVOKED` (`reason: "user"`) carry the acting member as `actorUserId`.
- `API_TOKEN_REVOKED` with `reason: "membership_lost"` comes from the handler on `ORG_MEMBER_REMOVED` and keeps the actor of that removal; with `reason: "leaked"` its `actorUserId` is `null` (genuinely system: GitHub reported it).
- `API_TOKEN_USED` is emitted by the host middleware in the same unit as `touchLastUsed`, whose `WHERE` buckets the write, so at most one row and one event per token and bucket.

## Traps

- **Usage tracking never fails the request.** The middleware catches, captures and logs a failed `touchLastUsed` unit and serves the request. A new reader keeps this.
- **The GitHub secret scanning route verifies the signature on the raw body before parsing it** (403 before 400). An unknown or malformed token is answered `false_positive`, not an error, and the owner is warned only when the revoke actually wrote a row, so a replayed report sends no second email.
