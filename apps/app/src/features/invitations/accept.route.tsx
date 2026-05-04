import { createRoute, lazyRouteComponent } from "@tanstack/react-router";
import { rootRoute } from "../../router/layouts";

export const acceptInvitationRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "accept-invitation/$invitationId",
  component: lazyRouteComponent(() => import("./accept.page"), "AcceptInvitationPage"),
});
