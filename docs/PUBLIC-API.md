# Public API — `/api/v1`

Reference for third parties calling this deployment with a Personal Access Token. Everything below
is the behaviour of `apps/api/src/public-api/` and the middleware it mounts — no generated spec
exists, and none is planned (`ROADMAP.md`), so this page is the contract.

The surface is deliberately small: three routes. What is *not* in it is documented at the bottom and
is part of the contract too.

## Base URL

`/api/v1` is mounted on the API origin. There is no hosted instance — substitute your deployment's
API origin. In this repo's local dev setup that origin is `http://localhost:3000` (`BETTER_AUTH_URL`
in `apps/api/.env`, `VITE_API_URL` in `apps/app/.env`).

```sh
export API_BASE="https://api.example.com"   # local dev: http://localhost:3000
export API_TOKEN="clean_…"
```

Every example below uses those two variables.

`v1` is the only version. A breaking change to a route would ship as `/api/v2`; the paths under
`/api/v1` do not change shape under you.

## Authentication

One mechanism: a bearer token in the `Authorization` header. Cookies are ignored — the session
middleware skips `/api/v1/*` entirely, so a browser session sent to these routes is a `401`.

```
Authorization: Bearer clean_…
```

The `Bearer ` prefix is required; the header value alone is a `401`.

**Token format.** A configurable prefix (`clean_` by default — a deployment may set its own via
`API_TOKEN_PREFIX`), 44 base58 characters, then a 6-character CRC32 checksum: 56 characters total
with the default prefix. Treat it as opaque; the checksum exists so the server can reject a mistyped
or truncated token without a database lookup, not for you to recompute.

**Getting a token.** A user creates one in the application at `/settings/tokens`, picking a name, a
scope subset and an optional expiry (capped at `API_TOKEN_MAX_EXPIRY_DAYS`, 365 days by default).
The raw token is shown exactly once, at creation. There is no API to create one — see
[Outside the public API](#outside-the-public-api).

**Lifecycle.** A token stays valid until one of:

| Event | Result |
|---|---|
| The user revokes it in `/settings/tokens` | `401` on every subsequent call |
| Its expiry passes | `401` |
| The user loses membership of the organization the token is scoped to | Revoked automatically, `401` |
| The user's account is banned | `401` while the ban is in force |
| The token is committed to a public GitHub repository | Revoked automatically via GitHub Secret Scanning; the owner is emailed |

All of these are the same `401` on the wire — the API does not tell a caller *why* a token stopped
working. Ask the user who issued it.

**Store the token server-side.** These are server-to-server credentials. Browser callers are also
subject to the API's CORS allowlist, which does not include arbitrary third-party origins.

## Scopes

A token carries a subset of three scopes, chosen at creation. There is no wildcard and no `admin`
scope. A route whose scope the token lacks returns `403` — the token is authenticated, it just
isn't permitted.

| Method | Path | Required scope |
|---|---|---|
| `GET` | `/api/v1/me` | `read:profile` |
| `PATCH` | `/api/v1/me` | `write:profile` |
| `GET` | `/api/v1/organizations` | `read:organizations` |

A token may additionally be *scoped to an organization* at creation. Today that scoping governs
cascade revocation (above), not response filtering: `GET /api/v1/organizations` returns every
organization the owning user belongs to, whichever organization the token names.

## Endpoints

### `GET /api/v1/me`

Returns the token owner's public profile.

```sh
curl -s "$API_BASE/api/v1/me" -H "Authorization: Bearer $API_TOKEN"
```

```json
{
  "user": {
    "id": "jrkNkJxPXu35Oj4HrZPqRaUPGsDOzLAg",
    "name": "Dev User",
    "email": "dev@example.com",
    "emailVerified": true,
    "image": "https://cdn.example.com/…/avatar.png",
    "createdAt": "2026-08-28T17:31:05.515Z",
    "updatedAt": "2026-09-01T11:54:19.613Z"
  }
}
```

`image` is `null` when the user has no avatar. Timestamps are ISO 8601 UTC.

These seven fields are the whole projection, and it is a whitelist enforced by a schema, not a hand
picked object: moderation state, billing identifiers, account-deletion state, pending email changes
and security capabilities are never exposed here, and a column added to the user table later cannot
appear in this response by accident.

### `PATCH /api/v1/me`

Updates the owner's display name. It is the only write in the public API.

```sh
curl -s -X PATCH "$API_BASE/api/v1/me" \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"New Name"}'
```

```json
{ "ok": true }
```

Body: `{ "name": string }`, 1–100 characters, required. No other field is accepted; unknown keys are
ignored. A rejected body returns `400 REQUEST_INVALID` with the offending fields in `metadata`.

**This route can return `409 POLICY_ACCEPTANCE_REQUIRED`** — see below. Reads never do.

### `GET /api/v1/organizations`

Lists the organizations the owner belongs to, with their role in each.

```sh
curl -s "$API_BASE/api/v1/organizations" -H "Authorization: Bearer $API_TOKEN"
```

```json
{
  "organizations": [
    {
      "id": "a1c087a7-9e0d-4f94-a509-6545adfcebdb",
      "name": "Personal",
      "slug": "personal-a1c087a7-9e0d-4f94-a509-6545adfcebdb",
      "role": "owner"
    }
  ]
}
```

The array is empty for a user with no membership. Not paginated.

## Errors

Every error the sub-app produces is JSON in one shape:

```json
{
  "error": {
    "code": "POLICY_ACCEPTANCE_REQUIRED",
    "message": "Policy acceptance required",
    "requestId": "13ec6458-1d24-4aea-bed8-a7cadaf13f29",
    "metadata": { }
  }
}
```

`code` is the stable field — branch on it, not on `message`, which is English prose and may change.
`metadata` is present only when the code carries structured detail. `requestId` is on every error
and is the identifier to quote in a support request.

The one exception: an unknown path or an unsupported method under `/api/v1` is served by the
framework's own handler and returns `404` with the plain-text body `404 Not Found`, not JSON.

| Status | `code` | When | What to do |
|---|---|---|---|
| `400` | `REQUEST_INVALID` | Request body failed validation. `metadata.fields[]` names each `path` and `message` | Fix the body; do not retry as-is |
| `401` | `HTTP_401` | No `Authorization` header, no `Bearer ` prefix, bad checksum, unknown, revoked or expired token, banned owner | Do not retry. The credential is dead — get a new token from the user |
| `403` | `HTTP_403` | The token lacks the scope the route requires | Do not retry. The user must issue a token with the scope |
| `409` | `POLICY_ACCEPTANCE_REQUIRED` | `PATCH /api/v1/me` only, when the owner has not accepted the current terms/privacy version | See below |
| `429` | `SECURITY_RATE_LIMITED` | A rate-limit window was exhausted. `metadata.retryAfter` mirrors the `Retry-After` header, in seconds | Wait, then retry |
| `500` | `INTERNAL_ERROR` | Unhandled server error | Retry with backoff; quote `requestId` if it persists |
| `502` | `POLICY_ACCEPTANCE_PROVIDER_FAILURE` | The policy-acceptance check itself failed on `PATCH /api/v1/me` | Retry with backoff |
| `503` | `HTTP_503` | Token lookup could not reach its store | Retry with backoff |
| `503` | `RATE_LIMITER_UNAVAILABLE` | The rate-limiter store is down. `/api/v1` fails **closed**: no request is served while the guard is blind | Retry with backoff |

### `409 POLICY_ACCEPTANCE_REQUIRED`

**Your token is not the problem, and retrying will not clear it.** The user who owns the token has
not accepted the current version of the terms of service or privacy policy. Until they do, every
mutating call on their behalf is refused — today that is `PATCH /api/v1/me`; reads keep working.

The acceptance can only happen in the application: the user signs in and accepts the new version at
`/legal/accept`. There is no API to accept on their behalf, by design — consent has to come from the
person.

So: surface it to the user as "action needed in <the application>", stop retrying that call, and
resume once the call stops returning `409`. Treat it as a durable state, not a transient failure —
an exponential backoff here will simply fail for as long as the user takes to read the terms.

## Rate limits

Two independent windows apply to `/api/v1`, in this order. The `/api/v1` surface is exempt from the
API's general per-session limit; these replace it.

| Axis | Limit | Window |
|---|---|---|
| Per token | 600 requests | 60 s |
| Per client IP | 1200 requests | 60 s |

They are separate counters on purpose: rotating through several tokens does not raise the IP
ceiling.

Responses advertise the budget with `RateLimit-Policy` and `RateLimit` (the
[IETF draft](https://datatracker.ietf.org/doc/draft-ietf-httpapi-ratelimit-headers/) format).
`q` is the quota, `w` the window in seconds, `r` the requests remaining, `t` the seconds until the
window resets:

```
RateLimit-Policy: "api-token-ip";q=1200;w=60
RateLimit: "api-token-ip";r=1199;t=60
```

A successful response reports the per-IP window (the last one evaluated). A `429` reports the window
that actually blocked, and adds `Retry-After` in seconds:

```
HTTP/1.1 429 Too Many Requests
RateLimit-Policy: "api-token";q=600;w=60
RateLimit: "api-token";r=0;t=60
Retry-After: 60
```

Honour `Retry-After`. It is never `0`.

## Outside the public API

The boundary is as much a part of the contract as the routes:

- **Token management is not reachable by token.** Creating, listing and revoking tokens lives at
  `/settings/tokens` on the session-authenticated surface, outside `/api/v1`. A token therefore
  cannot mint another token, extend its own life, or widen its own scopes. This is structural, not
  a check that could be forgotten.
- **There is no `admin` scope.** The platform-operator surface is not token-reachable at all, and
  `GET /api/v1/me` does not disclose whether the owner holds any operator role.
- **Everything else the product does** — billing, uploads, organization management, webhooks,
  notifications, RGPD data rights, authentication itself — is session-only. It is absent from
  `/api/v1` rather than gated inside it, so no new route can accidentally become token-reachable.
- **Sensitive user fields are absent, not filtered.** See `GET /api/v1/me` above.

If you need a capability that isn't here, it needs a route added to `/api/v1` — ask the deployment's
maintainer rather than looking for an undocumented path.
