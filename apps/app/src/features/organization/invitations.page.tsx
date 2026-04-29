import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@packages/ui/components/ui/card";
import { TypographyH1, TypographyMuted } from "@packages/ui/components/ui/typography";
import { useQuery } from "@tanstack/react-query";
import { activeOrgQueryOptions } from "../../adapters/queries/active-org";
import { currentMembershipQueryOptions } from "../../adapters/queries/current-membership";
import { orgInvitationsQueryOptions } from "../../adapters/queries/org-invitations";
import { InvitationRow } from "./_components/invitation-row";
import { InviteMemberForm } from "./_forms/invite-member-form";

export function OrgInvitationsPage() {
  const { data: org } = useQuery(activeOrgQueryOptions);
  const { data: membership } = useQuery(currentMembershipQueryOptions);
  const { data: invitations = [] } = useQuery(
    org
      ? orgInvitationsQueryOptions(org.id)
      : { ...orgInvitationsQueryOptions(""), enabled: false },
  );

  if (!org) {
    return (
      <main className="p-6">
        <TypographyMuted>No active organization.</TypographyMuted>
      </main>
    );
  }

  const canManage = membership?.role === "owner" || membership?.role === "admin";

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6">
      <TypographyH1>Invitations</TypographyH1>

      {canManage && (
        <Card>
          <CardHeader>
            <CardTitle>Invite a new member</CardTitle>
            <CardDescription>They will receive an email with a link to accept.</CardDescription>
          </CardHeader>
          <CardContent>
            <InviteMemberForm organizationId={org.id} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Pending invitations</CardTitle>
          <CardDescription>Invitations sent that haven't been accepted yet.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col divide-y">
          {invitations.length === 0 ? (
            <TypographyMuted>No invitations.</TypographyMuted>
          ) : (
            invitations.map((inv) => (
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
                canCancel={canManage}
              />
            ))
          )}
        </CardContent>
      </Card>
    </main>
  );
}
