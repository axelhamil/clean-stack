import { Badge } from "@packages/ui/components/ui/badge";
import { Button } from "@packages/ui/components/ui/button";
import {
  DescriptionDetails,
  DescriptionItem,
  DescriptionList,
  DescriptionTerm,
} from "@packages/ui/components/ui/description-list";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@packages/ui/components/ui/dialog";
import { LoadErrorAlert } from "@packages/ui/components/ui/load-error-alert";
import { NavLink } from "@packages/ui/components/ui/nav-link";
import { PageHeader } from "@packages/ui/components/ui/page-header";
import { Separator } from "@packages/ui/components/ui/separator";
import { TypographyH2, TypographyMuted } from "@packages/ui/components/ui/typography";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { toastError } from "../../shared/api/errors/toast";
import { sessionQueryOptions } from "../../shared/api/queries/session";
import { broadcastAuthChange } from "../../shared/auth/auth-broadcast";
import { ensureStaffPermission } from "../../shared/auth/ensure-staff";
import { useStaffAccess } from "../../shared/auth/use-staff-access";
import { errorFallback } from "../../shared/i18n/get-errors-t";
import { useFormatDate } from "../../shared/i18n/use-format-date";
import { EMPTY_VALUE } from "../../shared/utils";
import {
  isPlatformRole,
  PLATFORM_ROLE_LABEL_KEYS,
  USER_STATUS_LABEL_KEYS,
} from "./admin-user-labels";
import {
  banUserMutationOptions,
  resetPasswordMutationOptions,
  revokeSessionsMutationOptions,
  setRoleMutationOptions,
  startImpersonationMutationOptions,
  unbanUserMutationOptions,
} from "./api/admin-users.mutations";
import { adminUserQueryOptions } from "./api/admin-users.queries";
import { SessionsSection } from "./components/sessions-section";
import { BanForm } from "./forms/ban-form";
import { ImpersonateForm } from "./forms/impersonate-form";
import { SetRoleForm } from "./forms/set-role-form";

export const Route = createFileRoute("/_protected/_shell/_admin/admin/users/$id")({
  beforeLoad: ensureStaffPermission("users.read"),
  component: AdminUserDetailPage,
});

function AdminUserDetailPage() {
  const { t } = useTranslation(["admin", "common"]);
  const formatDate = useFormatDate();
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { can } = useStaffAccess();
  const canModerate = can("users.moderate");
  const [banOpen, setBanOpen] = useState(false);
  const [impersonateOpen, setImpersonateOpen] = useState(false);
  const [roleOpen, setRoleOpen] = useState(false);

  const query = useQuery(adminUserQueryOptions(id));

  const invalidateUser = () => queryClient.invalidateQueries({ queryKey: ["admin", "users"] });

  const banMutation = useMutation({
    ...banUserMutationOptions,
    onSuccess: () => {
      toast.success(t("users.detail.banSuccessToast"));
      setBanOpen(false);
      void invalidateUser();
    },
    onError: (err) => toastError(err, errorFallback("banUser")),
  });

  const unbanMutation = useMutation({
    ...unbanUserMutationOptions,
    onSuccess: () => {
      toast.success(t("users.detail.unbanSuccessToast"));
      void invalidateUser();
    },
    onError: (err) => toastError(err, errorFallback("unbanUser")),
  });

  const impersonateMutation = useMutation({
    ...startImpersonationMutationOptions,
    onSuccess: async () => {
      toast.success(t("users.detail.impersonateSuccessToast"));
      setImpersonateOpen(false);
      await queryClient.refetchQueries({ queryKey: sessionQueryOptions.queryKey });
      broadcastAuthChange({ identityChanged: true });
      void navigate({ to: "/dashboard" });
    },
    onError: (err) => toastError(err, errorFallback("startImpersonation")),
  });

  const revokeSessionsMutation = useMutation({
    ...revokeSessionsMutationOptions,
    onSuccess: () => {
      toast.success(t("users.detail.revokeSessionsSuccessToast"));
      void invalidateUser();
    },
    onError: (err) => toastError(err, errorFallback("revokeUserSessions")),
  });

  const resetPasswordMutation = useMutation({
    ...resetPasswordMutationOptions,
    onSuccess: () => toast.success(t("users.detail.resetPasswordSuccessToast")),
    onError: (err) => toastError(err, errorFallback("resetUserPassword")),
  });

  const setRoleMutation = useMutation({
    ...setRoleMutationOptions,
    onSuccess: () => {
      toast.success(t("users.detail.changeRoleSuccessToast"));
      setRoleOpen(false);
      void invalidateUser();
    },
    onError: (err) => toastError(err, errorFallback("setUserRole")),
  });

  const user = query.data;

  const backLink = (
    <NavLink asChild variant="plain" className="gap-1 self-start">
      <Link to="/admin/users">
        <ArrowLeft className="size-4" aria-hidden />
        {t("users.pageTitle")}
      </Link>
    </NavLink>
  );

  if (!user) {
    return (
      <main className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          {backLink}
          <PageHeader title={t("users.pageTitle")} />
        </div>
        {query.isError ? (
          <LoadErrorAlert message={t("users.detail.loadFailed")} />
        ) : (
          <TypographyMuted>{t("users.detail.loading")}</TypographyMuted>
        )}
      </main>
    );
  }

  return (
    <main className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        {backLink}
        <PageHeader
          title={user.name}
          actions={
            can("users.impersonate") && (
              <Dialog open={impersonateOpen} onOpenChange={setImpersonateOpen}>
                <DialogTrigger asChild>
                  <Button variant={user.banned ? "outline" : "default"}>
                    {t("users.detail.impersonate")}
                  </Button>
                </DialogTrigger>
                <DialogContent closeLabel={t("common:actions.close")}>
                  <DialogHeader>
                    <DialogTitle>{t("users.detail.impersonateDialogTitle")}</DialogTitle>
                  </DialogHeader>
                  <ImpersonateForm
                    isPending={impersonateMutation.isPending}
                    onSubmit={(values) => impersonateMutation.mutate({ id, ...values })}
                  />
                </DialogContent>
              </Dialog>
            )
          }
        />
      </div>

      <div className="grid gap-8 md:grid-cols-2">
        <section className="flex min-w-0 flex-col gap-4">
          <TypographyH2>{t("users.detail.identityTitle")}</TypographyH2>
          <DescriptionList layout="inline">
            <DescriptionItem className="gap-4">
              <DescriptionTerm className="shrink-0">{t("users.table.email")}</DescriptionTerm>
              <DescriptionDetails className="min-w-0 break-all">{user.email}</DescriptionDetails>
            </DescriptionItem>
            <DescriptionItem className="gap-4">
              <DescriptionTerm className="shrink-0">{t("users.table.role")}</DescriptionTerm>
              <DescriptionDetails className="flex-wrap justify-end">
                {user.role ? (
                  <Badge variant="secondary">
                    {isPlatformRole(user.role) ? t(PLATFORM_ROLE_LABEL_KEYS[user.role]) : user.role}
                  </Badge>
                ) : (
                  EMPTY_VALUE
                )}
                {can("users.role") && (
                  <Dialog open={roleOpen} onOpenChange={setRoleOpen}>
                    <DialogTrigger asChild>
                      <Button variant="outline" size="sm">
                        {t("users.detail.changeRole")}
                      </Button>
                    </DialogTrigger>
                    <DialogContent closeLabel={t("common:actions.close")}>
                      <DialogHeader>
                        <DialogTitle>{t("users.detail.changeRoleTitle")}</DialogTitle>
                        <DialogDescription>
                          {t("users.detail.changeRoleDescription")}
                        </DialogDescription>
                      </DialogHeader>
                      <SetRoleForm
                        currentRole={user.role && isPlatformRole(user.role) ? user.role : null}
                        isPending={setRoleMutation.isPending}
                        onSubmit={(values) => setRoleMutation.mutate({ id, ...values })}
                      />
                    </DialogContent>
                  </Dialog>
                )}
              </DescriptionDetails>
            </DescriptionItem>
            <DescriptionItem>
              <DescriptionTerm>{t("users.detail.twoFactorLabel")}</DescriptionTerm>
              <DescriptionDetails>
                {user.twoFactorEnabled
                  ? t("users.detail.twoFactorEnabled")
                  : t("users.detail.twoFactorDisabled")}
              </DescriptionDetails>
            </DescriptionItem>
            <DescriptionItem>
              <DescriptionTerm>{t("users.detail.memberSinceLabel")}</DescriptionTerm>
              <DescriptionDetails>{formatDate(user.createdAt)}</DescriptionDetails>
            </DescriptionItem>
          </DescriptionList>
        </section>

        <section className="flex min-w-0 flex-col gap-4">
          <TypographyH2>{t("users.detail.accountStatusTitle")}</TypographyH2>
          <DescriptionList layout="inline">
            <DescriptionItem>
              <DescriptionTerm>{t("users.table.status")}</DescriptionTerm>
              <DescriptionDetails>
                {user.banned ? (
                  <Badge variant="destructive">{t(USER_STATUS_LABEL_KEYS.suspended)}</Badge>
                ) : (
                  <Badge variant="outline">{t(USER_STATUS_LABEL_KEYS.active)}</Badge>
                )}
              </DescriptionDetails>
            </DescriptionItem>
            {user.banReason && (
              <DescriptionItem className="gap-4">
                <DescriptionTerm className="shrink-0">
                  {t("users.detail.reasonLabel")}
                </DescriptionTerm>
                <DescriptionDetails className="min-w-0 break-words">
                  {user.banReason}
                </DescriptionDetails>
              </DescriptionItem>
            )}
            {user.banned && (
              <DescriptionItem>
                <DescriptionTerm>{t("users.detail.expiresLabel")}</DescriptionTerm>
                <DescriptionDetails>
                  {user.banExpires === null
                    ? t("users.durationPermanent")
                    : formatDate(user.banExpires)}
                </DescriptionDetails>
              </DescriptionItem>
            )}
          </DescriptionList>
          {canModerate && (
            <div className="flex flex-wrap gap-2">
              {user.banned && (
                <Button
                  size="sm"
                  disabled={unbanMutation.isPending}
                  onClick={() => unbanMutation.mutate(id)}
                >
                  {t("users.detail.reactivate")}
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                disabled={revokeSessionsMutation.isPending}
                onClick={() => revokeSessionsMutation.mutate(id)}
              >
                {t("users.detail.revokeSessions")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={resetPasswordMutation.isPending}
                onClick={() => resetPasswordMutation.mutate(id)}
              >
                {t("users.detail.resetPassword")}
              </Button>
              {!user.banned && (
                <Dialog open={banOpen} onOpenChange={setBanOpen}>
                  <DialogTrigger asChild>
                    <Button variant="destructive" size="sm">
                      {t("users.detail.suspend")}
                    </Button>
                  </DialogTrigger>
                  <DialogContent closeLabel={t("common:actions.close")}>
                    <DialogHeader>
                      <DialogTitle>{t("users.suspendAccountTitle")}</DialogTitle>
                    </DialogHeader>
                    <BanForm
                      isPending={banMutation.isPending}
                      onSubmit={(values) => banMutation.mutate({ id, ...values })}
                    />
                  </DialogContent>
                </Dialog>
              )}
            </div>
          )}
        </section>
      </div>

      <Separator />

      <SessionsSection sessions={user.sessions} />
    </main>
  );
}
