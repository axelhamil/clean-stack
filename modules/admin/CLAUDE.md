# admin module rules

The staff back office server side: staff access and its overrides, moderation, step-up, four-eyes approvals, impersonation, ops. Auto-loaded under `modules/admin/`; module contract: `modules/CLAUDE.md`; capability model: `packages/access-control/CLAUDE.md`.

## Invariants

1. **Staff access is computed in one place, `staffAccessOf`** (`domain/staff/services/staff-access.service.ts`, beside the grant rules of `domain/staff/services/staff-rules.service.ts`; staff has no aggregate): role plus per permission overrides through `effectivePermissions`, and `mfaOk`. An id in `PLATFORM_ADMIN_IDS` is always a manager with no override and cannot be changed through the API (`ADMIN_STAFF_LISTED_FORBIDDEN`); a staff row of source `env` whose id left that list grants nothing. **Why**: every guard, the rgpd rule and the staff audience read the same answer.
2. **Nobody changes their own access, nobody grants a permission they do not hold, and only a `staff.manage` holder acts on a staff member.**
3. **The last manager cannot lose access.** Every path that can demote, revoke, ban or deny `staff.manage` first takes `lockActiveManagers()` and decides `isLastManager` in the same unit. **Why**: the lock turns a check-then-act race between two managers into a serial decision. Proven by `check:admin-staff` and `check:admin-atomicity` (`apps/api`). rgpd applies the same rule at account deletion through `IStaffAccessRules`.
4. **Step-up is a fresh TOTP, consumed once, bound to the session**, valid `ADMIN_STEP_UP_TTL_SECONDS`, refused for an impersonated session or an account without two-factor. A failed attempt emits `ADMIN_STEP_UP_FAILED` best effort, outside the unit, so it survives the rollback of the attempt.
5. **Four eyes for the configured actions** (`approvalEnabled`, `approvalActions`), the decision rules and status transitions held by the `ApprovalRequest` aggregate (`domain/approval/`), which builds the `ADMIN_APPROVAL_*` events: the request stores validated params; one pending request per action and subject, held by a partial unique index (a different one is `ADMIN_APPROVAL_ALREADY_PENDING_CONFLICT`); nobody requests about their own account; the requester cannot decide, nor can the subject; the decider needs the action's permission; and the requester must still hold it at decision time, else the request is closed as failed. **Why**: a request is a promise made at one moment, its author can lose the power before it is used.
6. **Approve is claim, execute, mark executed in one unit** (`DecideApprovalUseCase`). If execution fails after the claim, the unit rolls back and a separate unit records `ADMIN_APPROVAL_FAILED`. Stored params are re-parsed on read, a mismatch is `ADMIN_APPROVAL_PARAMS_INVALID`. A new approvable action needs its permission in `APPROVAL_ACTION_PERMISSION` (`@packages/access-control`), its `RequestParams` and `StoredParams` entries, its case in `readApprovedAction` (`application/approved-action.ts`) and a handler class (`prepare`, `authorize`, `run`) in `application/services/approval-handlers/`, bound in the `ApprovalHandlers` map of `admin.module.ts`; the compiler refuses a missing one.
7. **Impersonation**: self impersonation is refused; `ADMIN_IMPERSONATION_STARTED` is emitted in the same unit as the session start; every end emits `ADMIN_IMPERSONATION_STOPPED` with an honest `endReason` (a session found expired is reported as `expired`, at its expiry time). The impersonated user is told by the `notify-impersonated-user` handler. **Why**: impersonation is the most sensitive staff power, its trail must be exact.

## Events emitted

`ADMIN_STAFF_*` (added, role changed, revoked, override set and revoked), `ADMIN_APPROVAL_*` (requested, decided, executed, failed, cancelled, expired), `ADMIN_STEP_UP_VERIFIED` and `ADMIN_STEP_UP_FAILED`, `ADMIN_IMPERSONATION_STARTED` and `ADMIN_IMPERSONATION_STOPPED`, `ADMIN_USER_BANNED`, `ADMIN_USER_UNBANNED`, `ADMIN_USER_PASSWORD_RESET`, `ADMIN_USER_SESSIONS_REVOKED` with `USER_SIGNED_OUT` per ended session, `ADMIN_NOTE_ADDED`, `ADMIN_PLAN_OVERRIDE_SET` and `ADMIN_PLAN_OVERRIDE_REVOKED`, `ADMIN_OPS_OUTBOX_REQUEUED`, `ADMIN_OPS_STRIPE_EVENT_REPLAYED`, `ADMIN_VIEW_SAVED` and `ADMIN_VIEW_DELETED`. An expiry, or the closing of a deleted user's requests, has `actorUserId: null`. admin reacts to `USER_DELETED` by closing that user's approvals.

## Ports exposed

What rgpd consumes from admin: `modules/rgpd/CLAUDE.md`, Ports exposed. `IAuthProvider` is declared here and bound to the auth instance by the host (`apps/api/src/composition/auth-provider.ts`).

## Traps

- **The staff audience query mirrors `staffAccessOf` in SQL** (`apps/api/src/queries/staff-recipients.query.ts`, a host query because it joins admin and notifications tables). A change to the access rules changes that query in the same commit, or notifications reach the wrong people.
- **`ADMIN_STEP_UP_MFA_FORBIDDEN` is raised by the host guard and by `VerifyStepUpUseCase`**: both must stay in step. A use case that needs a step-up mid-flight takes it as an `IStepUpGate` answering a `Result`, never as a guard that throws.
- **Every permission check is server side**, from `StaffAccess`; the front only hides. A new staff route takes its guard from `RouteGuards`, never a role string.
- The `check:admin-*` scripts stay in `apps/api/scripts` because they boot the host container.
