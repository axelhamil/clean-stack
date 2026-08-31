import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@packages/ui/components/ui/card";
import { TypographyH1, TypographyMuted } from "@packages/ui/components/ui/typography";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { activeOrgQueryOptions } from "../../shared/api/queries/active-org";
import { currentMembershipQueryOptions } from "../../shared/api/queries/current-membership";
import { orgInvitationsQueryOptions } from "../../shared/api/queries/org-invitations";
import { orgMembersQueryOptions } from "../../shared/api/queries/org-members";
import { Can } from "../../shared/auth/can";
import { InvitationRow } from "./components/invitation-row";
import { MemberRow } from "./components/member-row";
import { OrgDangerCard } from "./components/org-danger-card";
import { OrgNotificationDefaultsCard } from "./components/org-notification-defaults-card";
import { InviteMemberForm } from "./forms/invite-member-form";
import { UpdateOrgForm } from "./forms/update-org-form";

export const Route = createFileRoute("/_protected/_shell/settings/_org-scope/organization")({
  component: OrganizationPage,
});

function OrganizationPage() {
  const { t } = useTranslation("settings");
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

  if (!org) return <TypographyMuted>{t("organization.noActiveOrg")}</TypographyMuted>;

  const pendingInvitations = invitations.filter((inv) => inv.status === "pending");

  return (
    <main className="flex flex-col gap-6">
      <TypographyH1 className="sr-only">{t("organization.title")}</TypographyH1>

      <Can requires={{ organization: ["update"] }}>
        <Card>
          <CardHeader>
            <CardTitle>{t("organization.detailsTitle")}</CardTitle>
            <CardDescription>{t("organization.detailsDescription")}</CardDescription>
          </CardHeader>
          <CardContent>
            <UpdateOrgForm organizationId={org.id} defaultValues={{ name: org.name }} />
          </CardContent>
        </Card>
      </Can>

      <Can requires={{ invitation: ["create"] }}>
        <Card>
          <CardHeader>
            <CardTitle>{t("organization.inviteTitle")}</CardTitle>
            <CardDescription>{t("organization.inviteDescription")}</CardDescription>
          </CardHeader>
          <CardContent>
            <InviteMemberForm organizationId={org.id} />
          </CardContent>
        </Card>
      </Can>

      <Card>
        <CardHeader>
          <CardTitle>{t("organization.membersTitle")}</CardTitle>
          <CardDescription>
            {t("organization.membersCount", { count: members.length })}
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

      {pendingInvitations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{t("organization.pendingInvitationsTitle")}</CardTitle>
            <CardDescription>
              {t("organization.pendingInvitationsCount", { count: pendingInvitations.length })}
            </CardDescription>
          </CardHeader>
          <CardContent>
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
          </CardContent>
        </Card>
      )}

      <OrgNotificationDefaultsCard />

      <OrgDangerCard />
    </main>
  );
}
