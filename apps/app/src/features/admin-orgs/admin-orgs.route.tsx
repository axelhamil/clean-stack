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
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useImpersonationGuard } from "../../shared/auth/use-impersonation-guard";
import { useFormatDate } from "../../shared/i18n/use-format-date";
import { setOrgSsoEnforcementMutationOptions } from "./api/admin-orgs.mutations";
import { adminOrgsInfiniteQueryOptions } from "./api/admin-orgs.queries";

export const Route = createFileRoute("/_protected/_shell/_admin/admin/orgs")({
  component: AdminOrgsPage,
});

function AdminOrgsPage() {
  const { t } = useTranslation("admin");
  const formatDate = useFormatDate();
  const [search, setSearch] = useState("");
  const queryClient = useQueryClient();
  const { blocked, reason } = useImpersonationGuard();

  const query = useInfiniteQuery(adminOrgsInfiniteQueryOptions(search));

  const ssoEnforcementMutation = useMutation({
    ...setOrgSsoEnforcementMutationOptions,
    onSuccess: () => {
      toast.success(t("orgs.ssoEnforcementUpdatedToast"));
      void queryClient.invalidateQueries({ queryKey: ["admin", "orgs"] });
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-10">
      <header>
        <TypographyH1 variant="page">{t("orgs.pageTitle")}</TypographyH1>
      </header>

      <Input
        placeholder={t("orgs.searchPlaceholder")}
        className="w-64"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {query.isLoading ? (
        <p>{t("orgs.loading")}</p>
      ) : query.isError ? (
        <p>{t("orgs.loadFailed")}</p>
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("orgs.table.name")}</TableHead>
                <TableHead>{t("orgs.table.slug")}</TableHead>
                <TableHead>{t("orgs.table.members")}</TableHead>
                <TableHead>{t("orgs.table.created")}</TableHead>
                <TableHead>{t("orgs.table.ssoEnforced")}</TableHead>
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
                    <TableCell>{formatDate(org.createdAt)}</TableCell>
                    <TableCell>
                      <Switch
                        aria-label={t("orgs.ssoEnforcedAriaLabel", { name: org.name })}
                        checked={org.ssoEnforced}
                        disabled={
                          (ssoEnforcementMutation.isPending &&
                            ssoEnforcementMutation.variables?.id === org.id) ||
                          blocked
                        }
                        title={reason}
                        onCheckedChange={(enforced) =>
                          ssoEnforcementMutation.mutate({ id: org.id, enforced })
                        }
                      />
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>

          <TypographyMuted>{t("orgs.ssoEnforcementOffHint")}</TypographyMuted>

          {query.hasNextPage && (
            <Button
              variant="outline"
              disabled={query.isFetchingNextPage}
              onClick={() => void query.fetchNextPage()}
            >
              {t("orgs.loadMore")}
            </Button>
          )}
        </>
      )}
    </main>
  );
}
