import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@packages/ui/components/ui/card";
import { TypographyH1 } from "@packages/ui/components/ui/typography";
import { useQuery } from "@tanstack/react-query";
import { activeOrgQueryOptions } from "../../adapters/queries/active-org";
import { currentMembershipQueryOptions } from "../../adapters/queries/current-membership";
import { orgMembersQueryOptions } from "../../adapters/queries/org-members";
import { MemberRow } from "./_components/member-row";

export function OrgMembersPage() {
  const { data: org } = useQuery(activeOrgQueryOptions);
  const { data: membership } = useQuery(currentMembershipQueryOptions);
  const { data: members = [] } = useQuery(
    org ? orgMembersQueryOptions(org.id) : { ...orgMembersQueryOptions(""), enabled: false },
  );

  if (!org) {
    return (
      <main className="p-6">
        <p>No active organization.</p>
      </main>
    );
  }

  const canEdit = membership?.role === "owner" || membership?.role === "admin";

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6">
      <TypographyH1>Members</TypographyH1>
      <Card>
        <CardHeader>
          <CardTitle>
            {members.length} member{members.length === 1 ? "" : "s"}
          </CardTitle>
          <CardDescription>Manage roles and remove members.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col divide-y">
          {members.map((m) => (
            <MemberRow
              key={m.id}
              member={{
                id: m.id,
                role: m.role as "owner" | "admin" | "member",
                user: { id: m.user.id, email: m.user.email, name: m.user.name },
              }}
              organizationId={org.id}
              canEdit={canEdit && m.user.id !== membership?.userId}
            />
          ))}
        </CardContent>
      </Card>
    </main>
  );
}
