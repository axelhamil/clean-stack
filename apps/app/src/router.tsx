import { createRouter } from "@tanstack/react-router";
import { accountRoute } from "./features/account/account.route";
import { adminAuditLogRoute } from "./features/admin-audit-log/admin-audit-log.route";
import { adminUserDetailRoute } from "./features/admin-users/admin-user-detail.route";
import { adminUsersRoute } from "./features/admin-users/admin-users.route";
import { forgotPasswordRoute } from "./features/auth/forgot-password.route";
import { magicLinkRoute } from "./features/auth/magic-link.route";
import { resetPasswordRoute } from "./features/auth/reset-password.route";
import { signInRoute } from "./features/auth/sign-in.route";
import { signUpRoute } from "./features/auth/sign-up.route";
import { twoFactorRoute } from "./features/auth/two-factor.route";
import { verifyEmailRoute } from "./features/auth/verify-email.route";
import { billingRoute } from "./features/billing/billing.route";
import { pricingRoute } from "./features/billing/pricing.route";
import { dashboardRoute } from "./features/dashboard/dashboard.route";
import { developersEventsRoute } from "./features/developers/events.route";
import { acceptInvitationRoute } from "./features/invitations/accept.route";
import { acceptPoliciesRoute } from "./features/legal/accept.route";
import { accessibilityRoute } from "./features/legal/accessibility.route";
import { cookiesRoute } from "./features/legal/cookies.route";
import { dataRightsRoute } from "./features/legal/data-rights.route";
import { privacyPolicyRoute } from "./features/legal/privacy-policy.route";
import { subProcessorsRoute } from "./features/legal/sub-processors.route";
import { termsRoute } from "./features/legal/terms.route";
import { newOrgRoute } from "./features/organization/new.route";
import { organizationRoute } from "./features/organization/organization.route";
import { privacyRoute } from "./features/privacy/privacy.route";
import { webhooksRoute } from "./features/webhooks/webhooks.route";
import {
  adminLayout,
  guestLayout,
  indexRoute,
  orgScopeLayout,
  protectedLayout,
  rootRoute,
  settingsIndexRoute,
  settingsLayout,
  shellLayout,
} from "./router/layouts";
import { queryClient } from "./shared/api/query-client";

const routeTree = rootRoute.addChildren([
  indexRoute,
  guestLayout.addChildren([signInRoute, signUpRoute, forgotPasswordRoute]),
  protectedLayout.addChildren([
    acceptPoliciesRoute,
    shellLayout.addChildren([
      dashboardRoute,
      newOrgRoute,
      adminLayout.addChildren([adminAuditLogRoute, adminUsersRoute, adminUserDetailRoute]),
      settingsLayout.addChildren([
        settingsIndexRoute,
        accountRoute,
        privacyRoute,
        orgScopeLayout.addChildren([billingRoute, organizationRoute, webhooksRoute]),
      ]),
    ]),
  ]),
  acceptInvitationRoute,
  dataRightsRoute,
  privacyPolicyRoute,
  termsRoute,
  subProcessorsRoute,
  accessibilityRoute,
  cookiesRoute,
  pricingRoute,
  developersEventsRoute,
  magicLinkRoute,
  resetPasswordRoute,
  twoFactorRoute,
  verifyEmailRoute,
]);

export const router = createRouter({
  routeTree,
  context: { queryClient },
  defaultPreload: "intent",
  defaultPreloadStaleTime: 0,
  defaultPendingMs: 100,
  defaultPendingMinMs: 300,
  scrollRestoration: true,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
