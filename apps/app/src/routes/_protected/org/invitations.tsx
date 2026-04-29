import { createFileRoute } from "@tanstack/react-router";
import { OrgInvitationsPage } from "../../../features/organization/invitations.page";

export const Route = createFileRoute("/_protected/org/invitations")({
  component: OrgInvitationsPage,
});
