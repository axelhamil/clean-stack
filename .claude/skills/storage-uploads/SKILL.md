---
name: storage-uploads
description: Use when working on file uploads, presigned URLs, S3/R2-compatible object storage or the confirm step. Trigger on "upload", "presign", "storage", "S3", "R2", "SeaweedFS", "headObject", "publicUrlFor". Not for email attachments or generic file handling.
---

# Storage (object-storage-agnostic, S3-compatible)

**Server is blind during upload** — client PUTs directly to provider via presigned URL; API only sees `presign` and `confirm`. Three-step `presign`→`PUT`→`confirm`.

**Why three steps**: R2 doesn't support Presigned POST (no `content-length-range`); providers don't verify the signed body — `confirm` (`HeadObject`+`DeleteObject` on mismatch) is the real enforcement. Don't add a Presigned POST flow.

1. **Port = pure transport.** `presignUpload`, `presignDownload`, `headObject`, `deleteObject`, `publicUrlFor`. Zero business rules.
2. **Use-cases enforce owner-scoped key** `<userId>/<scope>/<uuid>-<filename>`; download+confirm reject keys without the requester's `<userId>/` prefix (`*_FORBIDDEN`). No `throw` — `Result<T, Error>`.
3. **Validation at controller boundary** via `zV` (shared `@hono/zod-validator` wrapper that throws `HTTPException(400)`). Use-cases trust input.
4. **Routes = thin controllers.** `statusFor(error)` switch: `*_FORBIDDEN`→403 / `*_NOT_FOUND`→404 / `*_INTEGRITY_FAILED`→422 / `*_PROVIDER_FAILURE`→502.
5. **Provider-agnostic**: `region: "auto"`, `forcePathStyle: true`. Boot-time fail-hard if prod endpoint is localhost or creds are default.
6. **Confirm mandatory**: `HeadObject` actual size/contentType, deletes on mismatch, returns `{ key, size, contentType, publicUrl }`. Trusting client-declared values without `confirm` is the enforcement gap.
7. **Multi-step factory chain**: upload `mutationOptions` resolves only after `confirm` — UI never sees "maybe uploaded".

Local dev: storage is opt-in via `docker compose --profile storage up seaweedfs seaweedfs-init -d` (host port pinned to `8333`).
