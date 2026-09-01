import type { RouteKey } from "./back-routes";

/**
 * Why a live route has no front consumer. Each value is a claim someone can
 * check — "dormant" is not a synonym for "unused", it is a commitment that the
 * capability ships ready for its first consumer (spec D5).
 */
export type UiLessReason =
  | "infra-probe" // health/readiness, called by the platform
  | "internal-cron" // /internal/*, signature-guarded, called by the scheduler
  | "public-api" // /api/v1/*, consumed by third parties holding a token
  | "provider-callback" // webhook/IdP receiver, called by an external service
  | "library-owned" // opaque surface, route table owned by a dependency
  | "dormant-by-design"; // shipped ready for a consumer that does not exist yet

export type SurfaceEntry = { consumer: string } | { uiLess: UiLessReason };

export const ROUTE_MAP: Record<RouteKey, SurfaceEntry> = {
  "ALL /api/auth/*": { uiLess: "library-owned" },
  "DELETE /admin/users/:id/sessions": {
    consumer: "apps/app/src/features/admin-users/api/admin-users.mutations.ts",
  },
  "DELETE /consents": { consumer: "apps/app/src/shared/api/mutations/withdraw-consent.ts" },
  "DELETE /me/delete": { consumer: "apps/app/src/shared/api/mutations/cancel-account-deletion.ts" },
  "DELETE /settings/tokens/:id": {
    consumer: "apps/app/src/features/api-tokens/api/api-tokens.mutations.ts",
  },
  "DELETE /settings/webhooks/:id": {
    consumer: "apps/app/src/features/webhooks/api/webhooks.mutations.ts",
  },
  "DELETE /uploads": { uiLess: "dormant-by-design" },
  "GET /admin/audit-log": {
    consumer: "apps/app/src/features/admin-audit-log/api/audit-log.queries.ts",
  },
  "GET /admin/audit-log/verify": {
    consumer: "apps/app/src/features/admin-audit-log/api/audit-log.queries.ts",
  },
  "GET /admin/orgs": { consumer: "apps/app/src/features/admin-orgs/api/admin-orgs.queries.ts" },
  "GET /admin/orgs/:id": { consumer: "apps/app/src/features/admin-orgs/api/admin-orgs.queries.ts" },
  "GET /admin/users": { consumer: "apps/app/src/features/admin-users/api/admin-users.queries.ts" },
  "GET /admin/users/:id": {
    consumer: "apps/app/src/features/admin-users/api/admin-users.queries.ts",
  },
  "GET /api/v1/me": { uiLess: "public-api" },
  "GET /api/v1/organizations": { uiLess: "public-api" },
  "GET /billing/plans": { consumer: "apps/app/src/shared/api/queries/billing-plans.ts" },
  "GET /billing/subscription": { consumer: "apps/app/src/shared/api/queries/subscription.ts" },
  "GET /consents": { consumer: "apps/app/src/shared/api/queries/consent.ts" },
  "GET /internal/build-info": { uiLess: "internal-cron" },
  "GET /livez": { uiLess: "infra-probe" },
  "GET /me/delete/preflight": {
    consumer: "apps/app/src/shared/api/queries/account-deletion.ts",
  },
  "GET /me/policies": { consumer: "apps/app/src/shared/api/queries/policies.ts" },
  "GET /notifications": { consumer: "apps/app/src/shared/api/queries/notifications.ts" },
  "GET /notifications/org-preferences": {
    consumer: "apps/app/src/shared/api/queries/notifications.ts",
  },
  "GET /notifications/preferences": {
    consumer: "apps/app/src/shared/api/queries/notifications.ts",
  },
  "GET /notifications/stream": {
    consumer: "apps/app/src/shared/notifications/use-notification-stream.ts",
  },
  "GET /notifications/unread-count": {
    consumer: "apps/app/src/shared/api/queries/notifications.ts",
  },
  "GET /readyz": { uiLess: "infra-probe" },
  "GET /settings/tokens": {
    consumer: "apps/app/src/features/api-tokens/api/api-tokens.queries.ts",
  },
  "GET /settings/webhooks": { consumer: "apps/app/src/features/webhooks/api/webhooks.queries.ts" },
  "GET /settings/webhooks/:id/deliveries": {
    consumer: "apps/app/src/features/webhooks/api/webhooks.queries.ts",
  },
  "GET /settings/webhooks/:id/deliveries/:deliveryId": {
    consumer: "apps/app/src/features/webhooks/api/webhooks.queries.ts",
  },
  "GET /startupz": { uiLess: "infra-probe" },
  "PATCH /api/v1/me": { uiLess: "public-api" },
  "PATCH /settings/webhooks/:id": {
    consumer: "apps/app/src/features/webhooks/api/webhooks.mutations.ts",
  },
  "POST /admin/impersonation/:id/start": {
    consumer: "apps/app/src/features/admin-users/api/admin-users.mutations.ts",
  },
  "POST /admin/impersonation/stop": {
    consumer: "apps/app/src/shared/api/mutations/stop-impersonation.ts",
  },
  "POST /admin/orgs/:id/sso-enforcement": {
    consumer: "apps/app/src/features/admin-orgs/api/admin-orgs.mutations.ts",
  },
  "POST /admin/users/:id/ban": {
    consumer: "apps/app/src/features/admin-users/api/admin-users.mutations.ts",
  },
  "POST /admin/users/:id/reset-password": {
    consumer: "apps/app/src/features/admin-users/api/admin-users.mutations.ts",
  },
  "POST /admin/users/:id/unban": {
    consumer: "apps/app/src/features/admin-users/api/admin-users.mutations.ts",
  },
  "POST /api/token-scanning/github": { uiLess: "provider-callback" },
  "POST /billing/portal": { consumer: "apps/app/src/shared/api/mutations/open-billing-portal.ts" },
  "POST /consents": { consumer: "apps/app/src/shared/api/mutations/record-consent.ts" },
  "POST /csp-report": { uiLess: "provider-callback" },
  "POST /internal/flush-notification-emails": { uiLess: "internal-cron" },
  "POST /internal/rgpd-sweep": { uiLess: "internal-cron" },
  "POST /internal/sweep-audit-log": { uiLess: "internal-cron" },
  "POST /internal/sweep-consents": { uiLess: "internal-cron" },
  "POST /internal/sweep-email-messages": { uiLess: "internal-cron" },
  "POST /internal/sweep-notifications": { uiLess: "internal-cron" },
  "POST /internal/sweep-outbox": { uiLess: "internal-cron" },
  "POST /internal/sweep-webhook-delivery": { uiLess: "internal-cron" },
  "POST /me/delete": { consumer: "apps/app/src/shared/api/mutations/request-account-deletion.ts" },
  "POST /me/export": { consumer: "apps/app/src/shared/api/mutations/request-data-export.ts" },
  "POST /me/policies/accept": { consumer: "apps/app/src/shared/api/mutations/accept-policies.ts" },
  "POST /notifications/read": { consumer: "apps/app/src/shared/api/mutations/notifications.ts" },
  "POST /notifications/read-all": {
    consumer: "apps/app/src/shared/api/mutations/notifications.ts",
  },
  "POST /settings/organization/sso-enforcement": {
    consumer: "apps/app/src/features/sso/api/sso.mutations.ts",
  },
  "POST /settings/tokens": {
    consumer: "apps/app/src/features/api-tokens/api/api-tokens.mutations.ts",
  },
  "POST /settings/webhooks": {
    consumer: "apps/app/src/features/webhooks/api/webhooks.mutations.ts",
  },
  "POST /settings/webhooks/:id/deliveries/:deliveryId/replay": {
    consumer: "apps/app/src/features/webhooks/api/webhooks.mutations.ts",
  },
  "POST /settings/webhooks/:id/rotate-secret": {
    consumer: "apps/app/src/features/webhooks/api/webhooks.mutations.ts",
  },
  "POST /settings/webhooks/:id/test": {
    consumer: "apps/app/src/features/webhooks/api/webhooks.mutations.ts",
  },
  "POST /uploads/confirm": { consumer: "apps/app/src/shared/api/mutations/create-upload.ts" },
  "POST /uploads/download": { uiLess: "dormant-by-design" },
  "POST /uploads/presign": { consumer: "apps/app/src/shared/api/mutations/create-upload.ts" },
  "PUT /admin/users/:id/role": {
    consumer: "apps/app/src/features/admin-users/api/admin-users.mutations.ts",
  },
  "PUT /me/locale": { consumer: "apps/app/src/shared/api/mutations/set-locale.ts" },
  "PUT /notifications/org-preferences": {
    consumer: "apps/app/src/shared/api/mutations/notifications.ts",
  },
  "PUT /notifications/preferences": {
    consumer: "apps/app/src/shared/api/mutations/notifications.ts",
  },
};
