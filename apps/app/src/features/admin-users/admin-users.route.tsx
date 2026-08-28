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
import type { UserFilters } from "./admin-user-filters";
import { adminUsersInfiniteQueryOptions } from "./api/admin-users.queries";
import { UserRow } from "./components/user-row";

export const Route = createFileRoute("/_protected/_shell/_admin/admin/users")({
  component: AdminUsersPage,
});

function AdminUsersPage() {
  const [filters, setFilters] = useState<UserFilters>({
    search: "",
    role: undefined,
    banned: undefined,
  });

  const query = useInfiniteQuery(adminUsersInfiniteQueryOptions(filters));

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-10">
      <header>
        <TypographyH1 variant="page">Accounts</TypographyH1>
      </header>

      <div className="flex flex-wrap gap-3">
        <Input
          placeholder="Search…"
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
            <SelectValue placeholder="All roles" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All</SelectItem>
            <SelectItem value="admin">Admin</SelectItem>
            <SelectItem value="user">User</SelectItem>
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
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All</SelectItem>
            <SelectItem value="false">Active</SelectItem>
            <SelectItem value="true">Suspended</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {query.isLoading ? (
        <p>Loading…</p>
      ) : query.isError ? (
        <p>Failed to load accounts.</p>
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
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
              Load more
            </Button>
          )}
        </>
      )}
    </main>
  );
}
