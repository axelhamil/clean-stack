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
import { useInfiniteQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import type { UserFilters } from "./admin-user-filters";
import { stopImpersonationMutationOptions } from "./api/admin-users.mutations";
import { adminUsersInfiniteQueryOptions } from "./api/admin-users.queries";
import { UserRow } from "./components/user-row";

export function AdminUsersPage() {
  const [filters, setFilters] = useState<UserFilters>({
    search: "",
    role: undefined,
    banned: undefined,
  });

  const query = useInfiniteQuery(adminUsersInfiniteQueryOptions(filters));

  const stopImpersonation = useMutation({
    ...stopImpersonationMutationOptions,
    onSuccess: () => toast.success("Impersonation terminée"),
    onError: (err) => toast.error(err.message),
  });

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-10">
      <header className="flex items-center justify-between gap-4">
        <TypographyH1 variant="page">Comptes</TypographyH1>
        <Button
          variant="outline"
          size="sm"
          disabled={stopImpersonation.isPending}
          onClick={() => stopImpersonation.mutate()}
        >
          Quitter l'impersonation
        </Button>
      </header>

      <div className="flex flex-wrap gap-3">
        <Input
          placeholder="Rechercher…"
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
            <SelectValue placeholder="Tous les rôles" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">Tous</SelectItem>
            <SelectItem value="admin">Admin</SelectItem>
            <SelectItem value="user">Utilisateur</SelectItem>
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
            <SelectValue placeholder="Tous les statuts" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">Tous</SelectItem>
            <SelectItem value="false">Actif</SelectItem>
            <SelectItem value="true">Suspendu</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {query.isLoading ? (
        <p>Chargement…</p>
      ) : query.isError ? (
        <p>Impossible de charger les comptes.</p>
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Nom</TableHead>
                <TableHead>Rôle</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead>Créé le</TableHead>
                <TableHead />
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
              Charger plus
            </Button>
          )}
        </>
      )}
    </main>
  );
}
