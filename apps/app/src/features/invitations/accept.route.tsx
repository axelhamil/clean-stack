import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/accept-invitation/$invitationId")({
  component: lazyRouteComponent(() => import("./accept.page"), "AcceptInvitationPage"),
});
