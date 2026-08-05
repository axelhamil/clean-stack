import { Button } from "@packages/ui/components/ui/button";
import { Input } from "@packages/ui/components/ui/input";
import { NavLink } from "@packages/ui/components/ui/nav-link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@packages/ui/components/ui/table";
import { TypographyH1 } from "@packages/ui/components/ui/typography";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { adminOrgsInfiniteQueryOptions } from "./api/admin-orgs.queries";

export function AdminOrgsPage() {
  const [search, setSearch] = useState("");

  const query = useInfiniteQuery(adminOrgsInfiniteQueryOptions(search));

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-10">
      <header>
        <TypographyH1 variant="page">Organisations</TypographyH1>
      </header>

      <Input
        placeholder="Rechercher…"
        className="w-64"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {query.isLoading ? (
        <p>Chargement…</p>
      ) : query.isError ? (
        <p>Impossible de charger les organisations.</p>
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nom</TableHead>
                <TableHead>Identifiant</TableHead>
                <TableHead>Membres</TableHead>
                <TableHead>Créé le</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {query.data?.pages
                .flatMap((p) => p.items)
                .map((org) => (
                  <TableRow key={org.id}>
                    <TableCell>
                      <NavLink asChild variant="plain">
                        <Link to="/admin/orgs/$orgId" params={{ orgId: org.id }}>
                          {org.name}
                        </Link>
                      </NavLink>
                    </TableCell>
                    <TableCell>{org.slug}</TableCell>
                    <TableCell>{org.memberCount}</TableCell>
                    <TableCell>{new Date(org.createdAt).toLocaleDateString("fr-FR")}</TableCell>
                  </TableRow>
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
