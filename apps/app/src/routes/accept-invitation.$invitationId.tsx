import { createFileRoute } from "@tanstack/react-router";
import { AcceptInvitationPage } from "../features/invitations/accept.page";

export const Route = createFileRoute("/accept-invitation/$invitationId")({
  component: () => {
    const { invitationId } = Route.useParams();
    return <AcceptInvitationPage invitationId={invitationId} />;
  },
});
