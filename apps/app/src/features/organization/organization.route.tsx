import { LoadErrorAlert } from "@packages/ui/components/ui/load-error-alert";
import { SettingsSection } from "@packages/ui/components/ui/settings-section";
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
  const { data: membership } = useQuery(currentMembershipQueryOptions(org?.id ?? null));
  const membersQuery = useQuery(orgMembersQueryOptions(org?.id ?? null));
  const members = membersQuery.data ?? [];
  const invitationsQuery = useQuery(orgInvitationsQueryOptions(org?.id ?? null));
  const invitations = invitationsQuery.data ?? [];

  if (!org) {
    return (
      <main className="flex flex-col gap-8">
        <TypographyH1 className="sr-only">{t("organization.title")}</TypographyH1>
        <TypographyMuted>{t("organization.noActiveOrg")}</TypographyMuted>
      </main>
    );
  }

  const pendingInvitations = invitations.filter((inv) => inv.status === "pending");

  return (
    <main className="flex flex-col gap-8">
      <TypographyH1 className="sr-only">{t("organization.title")}</TypographyH1>

      <Can requires={{ organization: ["update"] }}>
        <SettingsSection
          title={t("organization.detailsTitle")}
          description={t("organization.detailsDescription")}
        >
          <UpdateOrgForm organizationId={org.id} defaultValues={{ name: org.name }} />
        </SettingsSection>
      </Can>

      <Can requires={{ invitation: ["create"] }}>
        <SettingsSection
          title={t("organization.inviteTitle")}
          description={t("organization.inviteDescription")}
        >
          <InviteMemberForm organizationId={org.id} />
        </SettingsSection>
      </Can>

      <SettingsSection
        title={t("organization.membersTitle")}
        description={
          membersQuery.data ? t("organization.membersCount", { count: members.length }) : undefined
        }
      >
        {membersQuery.isPending ? (
          <TypographyMuted>{t("organization.membersLoading")}</TypographyMuted>
        ) : membersQuery.isLoadingError ? (
          <LoadErrorAlert message={t("organization.membersLoadFailed")} />
        ) : (
          <ul className="flex flex-col gap-2">
            {members.map((m) => (
              <MemberRow
                key={m.id}
                member={m}
                organizationId={org.id}
                isCurrentUser={m.user.id === membership?.userId}
              />
            ))}
          </ul>
        )}
      </SettingsSection>

      {invitationsQuery.isLoadingError && (
        <SettingsSection title={t("organization.pendingInvitationsTitle")}>
          <LoadErrorAlert message={t("organization.invitationsLoadFailed")} />
        </SettingsSection>
      )}

      {pendingInvitations.length > 0 && (
        <SettingsSection
          title={t("organization.pendingInvitationsTitle")}
          description={t("organization.pendingInvitationsCount", {
            count: pendingInvitations.length,
          })}
        >
          <ul className="flex flex-col gap-2">
            {pendingInvitations.map((inv) => (
              <InvitationRow key={inv.id} invitation={inv} organizationId={org.id} />
            ))}
          </ul>
        </SettingsSection>
      )}

      <OrgNotificationDefaultsCard />

      <OrgDangerCard />
    </main>
  );
}
