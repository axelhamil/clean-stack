import { Button } from "@packages/ui/components/ui/button";
import { Input } from "@packages/ui/components/ui/input";
import { LoadErrorAlert } from "@packages/ui/components/ui/load-error-alert";
import { NavLink } from "@packages/ui/components/ui/nav-link";
import { PageHeader } from "@packages/ui/components/ui/page-header";
import { SkeletonTable } from "@packages/ui/components/ui/skeleton";
import { Switch } from "@packages/ui/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@packages/ui/components/ui/table";
import { TypographyMuted } from "@packages/ui/components/ui/typography";
import { toastError } from "@packages/web-kit/api/errors/toast";
import { errorFallback } from "@packages/web-kit/i18n/get-errors-t";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ensureStaffPermission } from "../../shared/auth/ensure-staff";
import { GuardHint } from "../../shared/auth/guard-hint";
import { ImpersonationReason } from "../../shared/auth/impersonation-reason";
import { useImpersonationGuard } from "../../shared/auth/use-impersonation-guard";
import { useStaffAccess } from "../../shared/auth/use-staff-access";
import { useFormatDate } from "../../shared/i18n/use-format-date";
import { setOrgSsoEnforcementMutationOptions } from "./api/admin-orgs.mutations";
import { adminOrgsInfiniteQueryOptions } from "./api/admin-orgs.queries";

export const Route = createFileRoute("/_protected/_shell/_admin/admin/orgs")({
  beforeLoad: ensureStaffPermission("orgs.read"),
  component: AdminOrgsPage,
});

function AdminOrgsPage() {
  const { t } = useTranslation("admin");
  const formatDate = useFormatDate();
  const [search, setSearch] = useState("");
  const queryClient = useQueryClient();
  const guard = useImpersonationGuard();
  const { can } = useStaffAccess();

  const query = useInfiniteQuery(adminOrgsInfiniteQueryOptions(search));
  const orgs = query.data?.pages.flatMap((p) => p.items) ?? [];

  const ssoEnforcementMutation = useMutation({
    ...setOrgSsoEnforcementMutationOptions,
    onSuccess: () => {
      toast.success(t("orgs.ssoEnforcementUpdatedToast"));
      void queryClient.invalidateQueries({ queryKey: ["admin", "orgs"] });
    },
    onError: (err) => toastError(err, errorFallback("updateAdminOrgSsoEnforcement")),
  });

  return (
    <main className="flex flex-col gap-6">
      <PageHeader title={t("orgs.pageTitle")} description={t("orgs.ssoEnforcementOffHint")} />
      <ImpersonationReason guard={guard} />

      <Input
        placeholder={t("orgs.searchPlaceholder")}
        className="w-full sm:w-64"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {query.isLoading && <SkeletonTable label={t("orgs.loading")} columns={5} />}

      {query.isError && <LoadErrorAlert message={t("orgs.loadFailed")} />}

      {query.isSuccess && orgs.length === 0 && <TypographyMuted>{t("orgs.empty")}</TypographyMuted>}

      {orgs.length > 0 && (
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
            {orgs.map((org) => {
              const saving =
                ssoEnforcementMutation.isPending && ssoEnforcementMutation.variables?.id === org.id;

              return (
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
                    <GuardHint guard={guard} otherwiseDisabled={saving}>
                      <Switch
                        aria-label={t("orgs.ssoEnforcedAriaLabel", { name: org.name })}
                        checked={org.ssoEnforced}
                        disabled={saving || guard.blocked || !can("orgs.sso")}
                        {...guard.describeProps(saving)}
                        onCheckedChange={(enforced) =>
                          ssoEnforcementMutation.mutate({ id: org.id, enforced })
                        }
                      />
                    </GuardHint>
                  </TableCell>
                </TableRow>
              );
            })}
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
          {t("orgs.loadMore")}
        </Button>
      )}
    </main>
  );
}
