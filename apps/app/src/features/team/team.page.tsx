import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@packages/ui/components/ui/card";
import { TypographyH1, TypographyMuted } from "@packages/ui/components/ui/typography";
import { useQuery } from "@tanstack/react-query";
import { activeOrgQueryOptions } from "../../shared/api/queries/active-org";
import { currentMembershipQueryOptions } from "../../shared/api/queries/current-membership";
import { orgInvitationsQueryOptions } from "../../shared/api/queries/org-invitations";
import { orgMembersQueryOptions } from "../../shared/api/queries/org-members";
import { Can } from "../../shared/auth/can";
import { InvitationRow } from "./components/invitation-row";
import { MemberRow } from "./components/member-row";
import { InviteMemberForm } from "./forms/invite-member-form";

export function TeamPage() {
  const { data: org } = useQuery(activeOrgQueryOptions);
  const { data: membership } = useQuery(currentMembershipQueryOptions);
  const { data: members = [] } = useQuery(
    org ? orgMembersQueryOptions(org.id) : { ...orgMembersQueryOptions(""), enabled: false },
  );
  const { data: invitations = [] } = useQuery(
    org
      ? orgInvitationsQueryOptions(org.id)
      : { ...orgInvitationsQueryOptions(""), enabled: false },
  );

  if (!org) return <TypographyMuted>No active organization.</TypographyMuted>;

  const pendingInvitations = invitations.filter((inv) => inv.status === "pending");

  return (
    <main className="flex flex-col gap-6">
      <TypographyH1 className="sr-only">Team settings</TypographyH1>
      <Can requires={{ invitation: ["create"] }}>
        <Card>
          <CardHeader>
            <CardTitle>Invite a new member</CardTitle>
            <CardDescription>They will receive an email with a link to accept.</CardDescription>
          </CardHeader>
          <CardContent>
            <InviteMemberForm organizationId={org.id} />
          </CardContent>
        </Card>
      </Can>

      <Card>
        <CardHeader>
          <CardTitle>Members</CardTitle>
          <CardDescription>
            {members.length} member{members.length === 1 ? "" : "s"} · manage roles and remove
            members.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="flex flex-col divide-y">
            {members.map((m) => (
              <MemberRow
                key={m.id}
                member={{
                  id: m.id,
                  role: m.role as "owner" | "admin" | "member",
                  user: { id: m.user.id, email: m.user.email, name: m.user.name },
                }}
                organizationId={org.id}
                isCurrentUser={m.user.id === membership?.userId}
              />
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pending invitations</CardTitle>
          <CardDescription>
            {pendingInvitations.length === 0
              ? "No invitations awaiting response."
              : `${pendingInvitations.length} invitation${pendingInvitations.length === 1 ? "" : "s"} awaiting response.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {pendingInvitations.length === 0 ? (
            <TypographyMuted>No invitations.</TypographyMuted>
          ) : (
            <ul className="flex flex-col divide-y">
              {pendingInvitations.map((inv) => (
                <InvitationRow
                  key={inv.id}
                  invitation={{
                    id: inv.id,
                    email: inv.email,
                    role: inv.role,
                    status: inv.status,
                    expiresAt: inv.expiresAt,
                  }}
                  organizationId={org.id}
                />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
