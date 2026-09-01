# Storage (object storage, S3-compatible)

Owner-scoped uploads on any S3-compatible backend. **Prod**: Cloudflare R2. **Dev**: SeaweedFS (opt-in via the `storage` Docker profile). Application code is backend-agnostic — only env vars change. Server contract lives in [`apps/api/CLAUDE.md`](../apps/api/CLAUDE.md) §Storage.

## Dev setup — SeaweedFS (first run)

```bash
docker compose --profile storage up seaweedfs seaweedfs-init -d
```

- `seaweedfs` runs `server -s3` (S3 API on host port **8333**).
- `seaweedfs-init` waits for the healthcheck, then creates the `clean-stack` bucket **once**. Idempotent — re-running is a no-op.
- A fresh clone gets a working bucket on the first `up`, no manual step.

**Healthcheck gotcha (already fixed in `docker-compose.yaml`)**: the probe targets `http://127.0.0.1:8333/`, **not** `localhost`. `localhost` resolves to IPv6 `::1`, where the S3 listener isn't bound → the check hangs as `unhealthy` and `seaweedfs-init` (gated on `service_healthy`) never runs, so the bucket is never created. Always use `127.0.0.1` for SeaweedFS healthchecks.

**S3 SDK checksum gotcha (already fixed in `storage.service.ts`)**: AWS SDK v3 ≥ 3.729 (Jan 2025) defaults `requestChecksumCalculation` to `WHEN_SUPPORTED`, which appends `x-amz-checksum-crc32` + `x-amz-sdk-checksum-algorithm=CRC32` to (pre)signed PUTs. Non-AWS S3 backends — **SeaweedFS, MinIO, Cloudflare R2, Backblaze** — reject these with `400 Bad Request` on the direct PUT. The `S3Client` is pinned to `requestChecksumCalculation: "WHEN_REQUIRED"` + `responseChecksumValidation: "WHEN_REQUIRED"` so the SDK stops auto-adding CRC32. Keep these set for any non-AWS endpoint.

App config (already in `apps/api/.env.example`):

| Var | Dev value | Notes |
|---|---|---|
| `S3_ENDPOINT` | `http://localhost:8333` | `http://seaweedfs:8333` when the api itself runs in Docker |
| `S3_BUCKET` | `clean-stack` | created by `seaweedfs-init` |
| `S3_REGION` | `auto` | R2 / SeaweedFS ignore it |
| `S3_FORCE_PATH_STYLE` | `true` | required — no vhost-style buckets |
| `S3_PUBLIC_URL` | `http://localhost:8333/clean-stack` | base for the returned `publicUrl` |
| `S3_ACCESS_KEY` / `S3_SECRET_KEY` | any non-empty | SeaweedFS accepts any creds by default |

## Key layout — one folder per user

Every object key is **owner-scoped**:

```
<userId>/<scope>/<uuid>-<filename>
```

- **`<userId>`** — top-level folder per user. The `confirm` and download paths reject any key whose prefix isn't the requester's `<userId>/` (`*_FORBIDDEN`), so a user can never presign, read, or confirm another user's object. This prefix check — not the presigned URL — is the real ownership boundary.
- **`<scope>`** — logical sub-bucket within a user, `^[a-z][a-z0-9-]{0,31}$`. Current scopes: `avatars`, `uploads`.
- **`<uuid>`** — `crypto.randomUUID()`, collision-free even when two files share a name.
- **`<filename>`** — sanitized client-side (`createUpload`, `sanitizeFilename`) to satisfy the server contract `^[\w\-. ]+$` (accents stripped, invalid chars → `-`). Cosmetic only; the uuid guarantees uniqueness.

Example avatar key: `b3f1…/avatars/9c2a…-photo.png`.

**Why per-user prefixing**: lifecycle ops stay trivial (delete a user → drop the `<userId>/` prefix), listings stay scoped, and the prefix check defends beyond the presign. Never flatten keys into one namespace — that re-introduces cross-user enumeration and orphan ambiguity, exactly the "merde à force d'amender le bucket" this layout prevents.

## Flow — presign → PUT → confirm

Three steps; the server is blind during the actual transfer (client PUTs straight to S3 via a presigned URL).

1. `POST /uploads/presign` → server builds the owner-scoped key + a presigned PUT URL.
2. Client `PUT`s the bytes directly to S3.
3. `POST /uploads/confirm` → server `HeadObject`s the real size/content-type, **deletes on mismatch**, returns the verified `{ key, size, contentType, publicUrl }`.

`confirm` is mandatory — trusting client-declared size/content-type without it is the enforcement gap. Client entry point: `createUploadMutationOptions` (`apps/app/src/shared/api/mutations/create-upload.ts`) runs all three and resolves only after `confirm` succeeds, so the UI never sees a "maybe uploaded" state.

## Deleting a replaced object

`DELETE /uploads` accepts `{ key }` **or** `{ url }`. The front never sees a storage key — `apps/app/src/shared/env.ts` has no storage variable — so it always sends `{ url }`, the public URL it already holds (e.g. `user.image`). The server derives the key from the URL via `IStorageService.keyFromPublicUrl`, the exact inverse of `publicUrlFor`, then runs the derived key through the same owner-prefix guard a submitted `key` goes through. A URL this storage didn't produce (a social-login avatar, say) resolves to `Option.none()` and the endpoint returns `{ deleted: false }` — not an error, not a `STORAGE_FORBIDDEN`, because a foreign URL is an entirely ordinary `user.image`.

Avatar replacement (`apps/app/src/features/account/components/upload-avatar.tsx`) uploads the new object and updates `user.image` **before** deleting the old one via `deleteUploadByUrl` (`create-upload.ts`). The order is deliberate: if the delete fails, the cost is one orphaned object, not an account left with no avatar. That failure is reported to telemetry (`captureError`) and swallowed for the user — the avatar change already succeeded.

## Why `POST /uploads/download` ships without a consumer

`POST /uploads/download` presigns a GET for a private object and is intentionally `dormant-by-design` in `apps/api/src/shared/surface/route-map.ts` — this is a boilerplate, not a product: nothing here currently stores a private object a user needs to read back, but the first feature that does (a private document, an export) needs presigned reads, not a new endpoint. It stays implemented, guarded, and tested so that feature doesn't start from zero.
