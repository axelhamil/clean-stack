import { Card, CardContent, CardHeader, CardTitle } from "@packages/ui/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@packages/ui/components/ui/table";
import { TypographyH1 } from "@packages/ui/components/ui/typography";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { isOrgRole, ROLE_LABEL_KEYS } from "../../shared/auth/role-labels";
import { useFormatDate } from "../../shared/i18n/use-format-date";
import { adminOrgDetailQueryOptions } from "./api/admin-orgs.queries";

export const Route = createFileRoute("/_protected/_shell/_admin/admin/orgs/$orgId")({
  component: AdminOrgDetailPage,
});

function AdminOrgDetailPage() {
  const { t } = useTranslation(["admin", "common"]);
  const formatDate = useFormatDate();
  const { orgId } = Route.useParams();

  const query = useQuery(adminOrgDetailQueryOptions(orgId));

  if (query.isLoading) {
    return (
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-10">
        <p>{t("orgs.detail.loading")}</p>
      </main>
    );
  }

  if (query.isError || !query.data) {
    return (
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-10">
        <p>{t("orgs.detail.loadFailed")}</p>
      </main>
    );
  }

  const org = query.data;

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-10">
      <header>
        <TypographyH1 variant="page">{org.name}</TypographyH1>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>{t("orgs.detail.detailsTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span>{t("orgs.detail.slugLabel")}</span>
              <span>{org.slug}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>{t("orgs.detail.planLabel")}</span>
              <span>{org.plan ?? "—"}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>{t("orgs.detail.createdLabel")}</span>
              <span>{formatDate(org.createdAt)}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("orgs.detail.membersTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("orgs.detail.table.email")}</TableHead>
                <TableHead>{t("orgs.detail.table.role")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {org.members.map((member) => (
                <TableRow key={member.userId}>
                  <TableCell>{member.email}</TableCell>
                  <TableCell>
                    {isOrgRole(member.role) ? t(ROLE_LABEL_KEYS[member.role]) : member.role}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </main>
  );
}
