import { Input } from "@packages/ui/components/ui/input";
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
import { TypographyMuted } from "@packages/ui/components/ui/typography";
import { useFormatDate } from "@packages/web-kit/i18n/use-format-date";
import { useInfiniteQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { requireSection } from "../../shared/auth/require-section";
import { QueryList } from "../../shared/components/query-list";
import { StaffPage } from "../../shared/components/staff-page";
import { useDebouncedFilter } from "../../shared/hooks/use-debounced-filter";
import { orgsInfiniteQueryOptions } from "./api/orgs.queries";
import { SsoEnforcementSwitch } from "./components/sso-enforcement-switch";

const orgsSearchSchema = z.object({ q: z.string().optional().catch(undefined) });

export const Route = createFileRoute("/_staff/orgs")({
  validateSearch: orgsSearchSchema,
  beforeLoad: requireSection("orgs"),
  component: OrgsPage,
});

function OrgsPage() {
  const { t } = useTranslation("admin");
  const formatDate = useFormatDate();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const query = useInfiniteQuery(orgsInfiniteQueryOptions(search.q?.trim() ?? ""));
  const [q, setQ] = useDebouncedFilter(search.q ?? "", (value) =>
    navigate({ search: { q: value || undefined }, replace: true }),
  );

  return (
    <StaffPage>
      <PageHeader title={t("orgs.pageTitle")} description={t("orgs.ssoEnforcementOffHint")} />

      <Input
        aria-label={t("orgs.searchLabel")}
        placeholder={t("orgs.searchPlaceholder")}
        className="w-full sm:w-64"
        value={q}
        onChange={(event) => setQ(event.target.value)}
      />

      <QueryList
        query={query}
        columns={4}
        loadingLabel={t("orgs.loading")}
        errorMessage={t("orgs.loadFailed")}
        emptyMessage={t("orgs.empty")}
      >
        {(orgs) => (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("orgs.table.name")}</TableHead>
                <TableHead className="hidden md:table-cell">{t("orgs.table.members")}</TableHead>
                <TableHead className="hidden md:table-cell">{t("orgs.table.created")}</TableHead>
                <TableHead>{t("orgs.table.ssoEnforced")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orgs.map((org) => (
                <TableRow key={org.id}>
                  <TableCell className="whitespace-normal wrap-anywhere">
                    <NavLink asChild variant="plain">
                      <Link to="/orgs/$id" params={{ id: org.id }}>
                        {org.name}
                      </Link>
                    </NavLink>
                    <TypographyMuted>{org.slug}</TypographyMuted>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">{org.memberCount}</TableCell>
                  <TableCell className="hidden md:table-cell">
                    {formatDate(org.createdAt)}
                  </TableCell>
                  <TableCell>
                    <SsoEnforcementSwitch org={org} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </QueryList>
    </StaffPage>
  );
}
