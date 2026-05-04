import { createRouter } from "@tanstack/react-router";
import { accountRoute } from "./features/account/account.route";
import { forgotPasswordRoute } from "./features/auth/forgot-password.route";
import { magicLinkRoute } from "./features/auth/magic-link.route";
import { resetPasswordRoute } from "./features/auth/reset-password.route";
import { signInRoute } from "./features/auth/sign-in.route";
import { signUpRoute } from "./features/auth/sign-up.route";
import { twoFactorRoute } from "./features/auth/two-factor.route";
import { verifyEmailRoute } from "./features/auth/verify-email.route";
import { billingRoute } from "./features/billing/billing.route";
import { dashboardRoute } from "./features/dashboard/dashboard.route";
import { acceptInvitationRoute } from "./features/invitations/accept.route";
import { dataRightsRoute } from "./features/legal/data-rights.route";
import { generalRoute } from "./features/organization/general.route";
import { newOrgRoute } from "./features/organization/new.route";
import { teamRoute } from "./features/team/team.route";
import {
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
    shellLayout.addChildren([
      dashboardRoute,
      newOrgRoute,
      settingsLayout.addChildren([
        settingsIndexRoute,
        accountRoute,
        orgScopeLayout.addChildren([billingRoute, generalRoute, teamRoute]),
      ]),
    ]),
  ]),
  acceptInvitationRoute,
  dataRightsRoute,
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
