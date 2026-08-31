import { Button } from "@packages/ui/components/ui/button";
import { Input } from "@packages/ui/components/ui/input";
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
  TableHead,
  TableHeader,
  TableRow,
} from "@packages/ui/components/ui/table";
import { TypographyH1 } from "@packages/ui/components/ui/typography";
import { useInfiniteQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { UserFilters } from "./admin-user-filters";
import { PLATFORM_ROLE_LABEL_KEYS, USER_STATUS_LABEL_KEYS } from "./admin-user-labels";
import { adminUsersInfiniteQueryOptions } from "./api/admin-users.queries";
import { UserRow } from "./components/user-row";

export const Route = createFileRoute("/_protected/_shell/_admin/admin/users")({
  component: AdminUsersPage,
});

function AdminUsersPage() {
  const { t } = useTranslation(["admin", "common"]);
  const [filters, setFilters] = useState<UserFilters>({
    search: "",
    role: undefined,
    banned: undefined,
  });

  const query = useInfiniteQuery(adminUsersInfiniteQueryOptions(filters));

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-10">
      <header>
        <TypographyH1 variant="page">{t("users.pageTitle")}</TypographyH1>
      </header>

      <div className="flex flex-wrap gap-3">
        <Input
          placeholder={t("users.searchPlaceholder")}
          className="w-64"
          value={filters.search}
          onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
        />

        <Select
          value={filters.role ?? ""}
          onValueChange={(v) =>
            setFilters((f) => ({
              ...f,
              role: v === "" ? undefined : (v as "admin" | "user"),
            }))
          }
        >
          <SelectTrigger className="w-36">
            <SelectValue placeholder={t("users.allRolesPlaceholder")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">{t("users.allOption")}</SelectItem>
            <SelectItem value="admin">{t(PLATFORM_ROLE_LABEL_KEYS.admin)}</SelectItem>
            <SelectItem value="user">{t(PLATFORM_ROLE_LABEL_KEYS.user)}</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={filters.banned === undefined ? "" : String(filters.banned)}
          onValueChange={(v) =>
            setFilters((f) => ({
              ...f,
              banned: v === "" ? undefined : v === "true",
            }))
          }
        >
          <SelectTrigger className="w-36">
            <SelectValue placeholder={t("users.allStatusesPlaceholder")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">{t("users.allOption")}</SelectItem>
            <SelectItem value="false">{t(USER_STATUS_LABEL_KEYS.active)}</SelectItem>
            <SelectItem value="true">{t(USER_STATUS_LABEL_KEYS.suspended)}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {query.isLoading ? (
        <p>{t("users.loading")}</p>
      ) : query.isError ? (
        <p>{t("users.loadFailed")}</p>
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("users.table.email")}</TableHead>
                <TableHead>{t("users.table.name")}</TableHead>
                <TableHead>{t("users.table.role")}</TableHead>
                <TableHead>{t("users.table.status")}</TableHead>
                <TableHead>{t("users.table.created")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {query.data?.pages
                .flatMap((p) => p.items)
                .map((item) => (
                  <UserRow key={item.id} item={item} />
                ))}
            </TableBody>
          </Table>

          {query.hasNextPage && (
            <Button
              variant="outline"
              disabled={query.isFetchingNextPage}
              onClick={() => void query.fetchNextPage()}
            >
              {t("users.loadMore")}
            </Button>
          )}
        </>
      )}
    </main>
  );
}
