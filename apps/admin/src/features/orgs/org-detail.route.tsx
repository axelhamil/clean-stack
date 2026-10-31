import {
  DescriptionDetails,
  DescriptionItem,
  DescriptionList,
  DescriptionTerm,
} from "@packages/ui/components/ui/description-list";
import { NavLink } from "@packages/ui/components/ui/nav-link";
import { PageHeader } from "@packages/ui/components/ui/page-header";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@packages/ui/components/ui/table";
import { TypographyH2, TypographyMuted } from "@packages/ui/components/ui/typography";
import { useFormatDate } from "@packages/web-kit/i18n/use-format-date";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { requireSection } from "../../shared/auth/require-section";
import { useStaff } from "../../shared/auth/use-staff";
import { BackIcon, BackLink } from "../../shared/components/back-link";
import { DetailState } from "../../shared/components/detail-state";
import { orgRoleLabelKey } from "../../shared/labels/org-role";
import { orgQueryOptions } from "./api/orgs.queries";
import { SsoEnforcementSwitch } from "./components/sso-enforcement-switch";

export const Route = createFileRoute("/_staff/orgs/$id")({
  beforeLoad: requireSection("orgs"),
  component: OrgDetailPage,
});

function OrgDetailPage() {
  const { t } = useTranslation(["admin", "common"]);
  const formatDate = useFormatDate();
  const { id } = Route.useParams();
  const { can } = useStaff();
  const query = useQuery(orgQueryOptions(id));

  return (
    <DetailState
      query={query}
      fallbackTitle={t("orgs.pageTitle")}
      loadingLabel={t("orgs.detail.loading")}
      errorMessage={t("orgs.detail.loadFailed")}
      back={
        <BackLink
          link={
            <Link to="/orgs">
              <BackIcon />
              {t("orgs.pageTitle")}
            </Link>
          }
        />
      }
    >
      {(org) => (
        <>
          <PageHeader title={org.name} />

          <div className="grid gap-8 md:grid-cols-2">
            <section className="flex min-w-0 flex-col gap-4">
              <TypographyH2>{t("orgs.detail.detailsTitle")}</TypographyH2>
              <DescriptionList layout="inline">
                <DescriptionItem className="gap-4">
                  <DescriptionTerm className="shrink-0">
                    {t("orgs.detail.slugLabel")}
                  </DescriptionTerm>
                  <DescriptionDetails className="min-w-0 wrap-anywhere">
                    {org.slug}
                  </DescriptionDetails>
                </DescriptionItem>
                {org.plan && (
                  <DescriptionItem>
                    <DescriptionTerm>{t("orgs.detail.planLabel")}</DescriptionTerm>
                    <DescriptionDetails>{org.plan}</DescriptionDetails>
                  </DescriptionItem>
                )}
                <DescriptionItem>
                  <DescriptionTerm>{t("orgs.detail.createdLabel")}</DescriptionTerm>
                  <DescriptionDetails>{formatDate(org.createdAt)}</DescriptionDetails>
                </DescriptionItem>
                <DescriptionItem>
                  <DescriptionTerm>{t("orgs.table.ssoEnforced")}</DescriptionTerm>
                  <DescriptionDetails>
                    <SsoEnforcementSwitch org={org} />
                  </DescriptionDetails>
                </DescriptionItem>
              </DescriptionList>
            </section>

            <section className="flex min-w-0 flex-col gap-4">
              <TypographyH2>{t("orgs.detail.membersTitle")}</TypographyH2>
              {org.members.length === 0 ? (
                <TypographyMuted>{t("orgs.detail.membersEmpty")}</TypographyMuted>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("orgs.detail.table.email")}</TableHead>
                      <TableHead>{t("orgs.detail.table.role")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {org.members.map((member) => {
                      const roleKey = orgRoleLabelKey(member.role);

                      return (
                        <TableRow key={member.userId}>
                          <TableCell className="whitespace-normal wrap-anywhere">
                            {can("users.read") ? (
                              <NavLink asChild variant="plain">
                                <Link to="/users/$id" params={{ id: member.userId }}>
                                  {member.email}
                                </Link>
                              </NavLink>
                            ) : (
                              member.email
                            )}
                          </TableCell>
                          <TableCell>{roleKey ? t(roleKey) : member.role}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </section>
          </div>
        </>
      )}
    </DetailState>
  );
}
