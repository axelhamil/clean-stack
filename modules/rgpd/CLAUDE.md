# rgpd module rules

Account erasure (GDPR Art. 17) and data export (Art. 20). Auto-loaded under `modules/rgpd/`; module contract: `modules/CLAUDE.md`. rgpd writes kit tables (user, session, account, member, organization) directly: the one erasure exception of contract 5.

## Invariants

1. **Erasure has two phases.** A request sets `pending_deletion_until = now + gracePeriodDays` and emits `USER_DELETION_REQUESTED`; the user can cancel until then; the wipe runs only once the grace has elapsed, else `ACCOUNT_DELETION_NOT_FOUND`. **Why**: an erasure cannot be undone, the grace is the cancel window.
2. **A request is refused** while the user is the sole owner of a non personal organization that has other members (`ACCOUNT_DELETION_BLOCKED`) or is the last staff manager (`ACCOUNT_DELETION_LAST_MANAGER_FORBIDDEN`, decided inside the unit after `lockActiveManagers`, the same rule as `modules/admin`). It needs the TOTP code when two-factor is on, else the password.
3. **The wipe is one transaction, all or nothing**: anonymise the user row (it survives, so foreign keys hold), erase staff data, delete sessions, accounts, two-factor, passkeys, memberships and sent invitations, revoke API tokens, delete the personal organization and every organization left with no member, emit every resulting event (`USER_DELETED`, `ORG_DELETED`, `ORG_MEMBER_REMOVED`, `API_TOKEN_REVOKED`, `ADMIN_STAFF_REVOKED`, `ADMIN_IMPERSONATION_STOPPED`), and enqueue the confirmation email. If the email cannot be enqueued, the whole wipe rolls back. **Why**: a half erased account is the one outcome an erasure must never produce, and a wipe nobody is told about is unverifiable.
4. **The wipe is idempotent**: the anonymising `UPDATE ... WHERE deleted_at IS NULL` returning no row means another run already wiped the account, and nothing is emitted a second time.
5. **Object storage is purged after commit**, by the prefix `<userId>/`; a failure is logged for manual cleanup and never rolls back. **Why**: storage is not transactional, a commit must not wait on it. A file a module stores outside that prefix survives the erasure.
6. **The sweep checks its time budget between wipes, never inside one**, and reports `truncated` or `batch-error` through the sweep heartbeat.
7. **Export**: at most once per `exportRateLimitHours` (`ACCOUNT_EXPORT_RATE_LIMITED`); the JSON is uploaded under `<userId>/exports/`, presigned, and `touchExportRequestedAt` shares one unit with `USER_EXPORT_REQUESTED` and `USER_EXPORT_COMPLETED`. The email is best effort, its failure only logged.

## Events emitted

Those of invariant 3, plus `USER_DELETION_REQUESTED`, `USER_DELETION_CANCELLED`, `USER_EXPORT_REQUESTED`, `USER_EXPORT_COMPLETED`. The erased user is the actor: the `USER_*` events name only `userId`, the others set `actorUserId` to that user, except `ADMIN_IMPERSONATION_STOPPED`, whose actor stays the staff member who impersonated.

## Ports exposed

rgpd declares and the host binds (`apps/api/src/composition/sources/rgpd.ts`, `container.ts`): `IApiTokenRevoker` (bound to `RevokeAllUserTokensUseCase` of `@modules/api-token`; rgpd emits the resulting `API_TOKEN_REVOKED`), `IStaffStore`, `IStaffAccessRules`, `IStaffDataEraser`, `IEndedSessionsReader` (served by `@modules/admin`), `ITotpVerifier` and `IExportStorage` (host and uploads).

## Traps

- **A new table holding personal data joins the wipe and the export in the same change**: `IAccountEraser` (with its step in `AccountWipeService`) and `IUserDataExportReader`, or the port of the module that owns the table. A table scoped by `organizationId` is covered by the organization cascade only when that organization is deleted. Nothing fails when a table is forgotten: it survives the erasure silently. The rollback is proven by `check:wipe-rollback` (`apps/api`).
