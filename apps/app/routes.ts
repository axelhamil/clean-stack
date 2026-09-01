import { index, layout, rootRoute, route } from "@tanstack/virtual-file-routes";

export const routes = rootRoute("router/__root.tsx", [
  index("router/index.route.tsx"),

  layout("_guest", "router/_guest.tsx", [
    route("/sign-in", "features/auth/sign-in.route.tsx"),
    route("/sign-up", "features/auth/sign-up.route.tsx"),
    route("/forgot-password", "features/auth/forgot-password.route.tsx"),
  ]),

  layout("_protected", "router/_protected.tsx", [
    route("/legal/accept", "features/legal/accept.route.tsx"),

    layout("_shell", "router/_shell.tsx", [
      route("/dashboard", "features/dashboard/dashboard.route.tsx"),
      route("/org/new", "features/organization/new.route.tsx"),

      layout("_admin", "router/_admin.tsx", [
        route("/admin/audit-log", "features/admin-audit-log/admin-audit-log.route.tsx"),
        route("/admin/orgs", "features/admin-orgs/admin-orgs.route.tsx"),
        route("/admin/orgs/$orgId", "features/admin-orgs/admin-org-detail.route.tsx"),
        route("/admin/users", "features/admin-users/admin-users.route.tsx"),
        route("/admin/users/$id", "features/admin-users/admin-user-detail.route.tsx"),
      ]),

      route("/settings", "router/settings.tsx", [
        index("router/settings-index.route.tsx"),
        route("/account", "features/account/account.route.tsx"),
        route("/privacy", "features/privacy/privacy.route.tsx"),
        route("/api-tokens", "features/api-tokens/api-tokens.route.tsx"),
        route("/notifications", "features/notifications/notifications.route.tsx"),

        layout("_org-scope", "router/_org-scope.tsx", [
          route("/billing", "features/billing/billing.route.tsx"),
          route("/organization", "features/organization/organization.route.tsx"),
          route("/webhooks", "features/webhooks/webhooks.route.tsx"),
          route("/sso", "features/sso/sso.route.tsx"),
        ]),
      ]),
    ]),
  ]),

  route("/accept-invitation/$invitationId", "features/invitations/accept.route.tsx"),
  route("/legal/data-rights", "features/legal/data-rights.route.tsx"),
  route("/legal/privacy-policy", "features/legal/privacy-policy.route.tsx"),
  route("/legal/terms", "features/legal/terms.route.tsx"),
  route("/legal/sub-processors", "features/legal/sub-processors.route.tsx"),
  route("/legal/accessibility", "features/legal/accessibility.route.tsx"),
  route("/legal/cookies", "features/legal/cookies.route.tsx"),
  route("/pricing", "features/billing/pricing.route.tsx"),
  route("/developers/events", "features/developers/events.route.tsx"),
  route("/magic-link", "features/auth/magic-link.route.tsx"),
  route("/reset-password", "features/auth/reset-password.route.tsx"),
  route("/two-factor", "features/auth/two-factor.route.tsx"),
  route("/verify-email", "features/auth/verify-email.route.tsx"),
]);

export default routes;
