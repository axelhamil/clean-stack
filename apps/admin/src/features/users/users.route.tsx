import { Badge } from "@packages/ui/components/ui/badge";
import { Input } from "@packages/ui/components/ui/input";
import { NavLink } from "@packages/ui/components/ui/nav-link";
import { PageHeader } from "@packages/ui/components/ui/page-header";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@packages/ui/components/ui/select";
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
import { usersInfiniteQueryOptions } from "../../shared/api/queries/users";
import { requireSection } from "../../shared/auth/require-section";
import { QueryList } from "../../shared/components/query-list";
import { StaffPage } from "../../shared/components/staff-page";
import { useDebouncedFilter } from "../../shared/hooks/use-debounced-filter";
import { userQueryOf, usersSearchSchema } from "./users-filters";

const ALL = "all";

export const Route = createFileRoute("/_staff/users")({
  validateSearch: usersSearchSchema,
  beforeLoad: requireSection("users"),
  component: UsersPage,
});

function UsersPage() {
  const { t } = useTranslation("admin");
  const formatDate = useFormatDate();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const query = useInfiniteQuery(usersInfiniteQueryOptions(userQueryOf(search)));

  const [q, setQ] = useDebouncedFilter(search.q ?? "", (value) =>
    navigate({ search: (prev) => ({ ...prev, q: value || undefined }), replace: true }),
  );
  const [org, setOrg] = useDebouncedFilter(search.org ?? "", (value) =>
    navigate({ search: (prev) => ({ ...prev, org: value || undefined }), replace: true }),
  );

  return (
    <StaffPage>
      <PageHeader title={t("users.pageTitle")} />

      <div className="flex flex-wrap gap-3">
        <Input
          aria-label={t("users.searchLabel")}
          placeholder={t("users.searchPlaceholder")}
          className="w-full sm:w-64"
          value={q}
          onChange={(event) => setQ(event.target.value)}
        />
        <Input
          aria-label={t("users.organizationFilter")}
          placeholder={t("users.organizationFilter")}
          className="w-full sm:w-64"
          value={org}
          onChange={(event) => setOrg(event.target.value)}
        />
        <Select
          value={search.status ?? ALL}
          onValueChange={(value) =>
            navigate({
              search: (prev) => ({
                ...prev,
                status: value === "active" || value === "suspended" ? value : undefined,
              }),
              replace: true,
            })
          }
        >
          <SelectTrigger aria-label={t("users.table.status")} className="w-full sm:w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t("users.allStatusesPlaceholder")}</SelectItem>
            <SelectItem value="active">{t("users.status.active")}</SelectItem>
            <SelectItem value="suspended">{t("users.status.suspended")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <QueryList
        query={query}
        columns={3}
        loadingLabel={t("users.loading")}
        errorMessage={t("users.loadFailed")}
        emptyMessage={t("users.empty")}
      >
        {(users) => (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("users.table.account")}</TableHead>
                <TableHead>{t("users.table.status")}</TableHead>
                <TableHead className="hidden md:table-cell">{t("users.table.created")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="whitespace-normal wrap-anywhere">
                    <NavLink asChild variant="plain">
                      <Link to="/users/$id" params={{ id: user.id }}>
                        {user.name || user.email}
                      </Link>
                    </NavLink>
                    {user.name && <TypographyMuted>{user.email}</TypographyMuted>}
                  </TableCell>
                  <TableCell>
                    <Badge variant={user.banned ? "destructive" : "outline"}>
                      {t(user.banned ? "users.status.suspended" : "users.status.active")}
                    </Badge>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    {formatDate(user.createdAt)}
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
