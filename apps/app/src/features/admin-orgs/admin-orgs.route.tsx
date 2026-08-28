import { Button } from "@packages/ui/components/ui/button";
import { Input } from "@packages/ui/components/ui/input";
import { NavLink } from "@packages/ui/components/ui/nav-link";
import { Switch } from "@packages/ui/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@packages/ui/components/ui/table";
import { TypographyH1, TypographyMuted } from "@packages/ui/components/ui/typography";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { setOrgSsoEnforcementMutationOptions } from "./api/admin-orgs.mutations";
import { adminOrgsInfiniteQueryOptions } from "./api/admin-orgs.queries";

export const Route = createFileRoute("/_protected/_shell/_admin/admin/orgs")({
  component: AdminOrgsPage,
});

function AdminOrgsPage() {
  const [search, setSearch] = useState("");
  const queryClient = useQueryClient();

  const query = useInfiniteQuery(adminOrgsInfiniteQueryOptions(search));

  const ssoEnforcementMutation = useMutation({
    ...setOrgSsoEnforcementMutationOptions,
    onSuccess: () => {
      toast.success("SSO enforcement updated.");
      void queryClient.invalidateQueries({ queryKey: ["admin", "orgs"] });
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-10">
      <header>
        <TypographyH1 variant="page">Organizations</TypographyH1>
      </header>

      <Input
        placeholder="Search…"
        className="w-64"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {query.isLoading ? (
        <p>Loading…</p>
      ) : query.isError ? (
        <p>Failed to load organizations.</p>
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Slug</TableHead>
                <TableHead>Members</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>SSO enforced</TableHead>
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
                    <TableCell>{new Date(org.createdAt).toLocaleDateString()}</TableCell>
                    <TableCell>
                      <Switch
                        aria-label={`SSO enforced for ${org.name}`}
                        checked={org.ssoEnforced}
                        disabled={
                          ssoEnforcementMutation.isPending &&
                          ssoEnforcementMutation.variables?.id === org.id
                        }
                        onCheckedChange={(enforced) =>
                          ssoEnforcementMutation.mutate({ id: org.id, enforced })
                        }
                      />
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>

          <TypographyMuted>
            Turning SSO enforcement off lets members of that organization sign in with a password
            again.
          </TypographyMuted>

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
