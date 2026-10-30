import { Button } from "@packages/ui/components/ui/button";
import { Input } from "@packages/ui/components/ui/input";
import { LoadErrorAlert } from "@packages/ui/components/ui/load-error-alert";
import { PageHeader } from "@packages/ui/components/ui/page-header";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@packages/ui/components/ui/select";
import { SkeletonTable } from "@packages/ui/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@packages/ui/components/ui/table";
import { TypographyMuted } from "@packages/ui/components/ui/typography";
import { useInfiniteQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ensureStaffPermission } from "../../shared/auth/ensure-staff";
import type { UserFilters } from "./admin-user-filters";
import { USER_STATUS_LABEL_KEYS } from "./admin-user-labels";
import { adminUsersInfiniteQueryOptions } from "./api/admin-users.queries";
import { UserRow } from "./components/user-row";

const ALL = "all";

export const Route = createFileRoute("/_protected/_shell/_admin/admin/users")({
  beforeLoad: ensureStaffPermission("users.read"),
  component: AdminUsersPage,
});

function AdminUsersPage() {
  const { t } = useTranslation("admin");
  const [filters, setFilters] = useState<UserFilters>({
    search: "",
    banned: undefined,
  });

  const query = useInfiniteQuery(adminUsersInfiniteQueryOptions(filters));
  const users = query.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <main className="flex flex-col gap-6">
      <PageHeader title={t("users.pageTitle")} />

      <div className="flex flex-wrap gap-3">
        <Input
          placeholder={t("users.searchPlaceholder")}
          className="w-full sm:w-64"
          value={filters.search}
          onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
        />

        <Select
          value={filters.banned === undefined ? ALL : String(filters.banned)}
          onValueChange={(v) =>
            setFilters((f) => ({
              ...f,
              banned: v === ALL ? undefined : v === "true",
            }))
          }
        >
          <SelectTrigger
            aria-label={t("users.table.status")}
            className="flex-1 sm:w-44 sm:flex-none"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t("users.allStatusesPlaceholder")}</SelectItem>
            <SelectItem value="false">{t(USER_STATUS_LABEL_KEYS.active)}</SelectItem>
            <SelectItem value="true">{t(USER_STATUS_LABEL_KEYS.suspended)}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {query.isLoading && <SkeletonTable label={t("users.loading")} columns={4} />}

      {query.isError && <LoadErrorAlert message={t("users.loadFailed")} />}

      {query.isSuccess && users.length === 0 && (
        <TypographyMuted>{t("users.empty")}</TypographyMuted>
      )}

      {users.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("users.table.email")}</TableHead>
              <TableHead>{t("users.table.name")}</TableHead>
              <TableHead>{t("users.table.status")}</TableHead>
              <TableHead>{t("users.table.created")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((item) => (
              <UserRow key={item.id} item={item} />
            ))}
          </TableBody>
        </Table>
      )}

      {query.hasNextPage && (
        <Button
          variant="outline"
          className="self-start"
          disabled={query.isFetchingNextPage}
          onClick={() => void query.fetchNextPage()}
        >
          {t("users.loadMore")}
        </Button>
      )}
    </main>
  );
}
