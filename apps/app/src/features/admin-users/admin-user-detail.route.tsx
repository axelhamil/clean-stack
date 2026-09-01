import { Badge } from "@packages/ui/components/ui/badge";
import { Button } from "@packages/ui/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@packages/ui/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@packages/ui/components/ui/dialog";
import { TypographyH1 } from "@packages/ui/components/ui/typography";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { toastError } from "../../shared/api/errors/toast";
import { sessionQueryOptions } from "../../shared/api/queries/session";
import { broadcastAuthChange } from "../../shared/auth/auth-broadcast";
import { getErrorsT } from "../../shared/i18n/get-errors-t";
import { useFormatDate } from "../../shared/i18n/use-format-date";
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
import { SessionsCard } from "./components/sessions-card";
import { BanForm } from "./forms/ban-form";
import { ImpersonateForm } from "./forms/impersonate-form";
import { SetRoleForm } from "./forms/set-role-form";

export const Route = createFileRoute("/_protected/_shell/_admin/admin/users/$id")({
  component: AdminUserDetailPage,
});

function AdminUserDetailPage() {
  const { t } = useTranslation(["admin", "common"]);
  const formatDate = useFormatDate();
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
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
    onError: (err) =>
      toastError(
        err,
        getErrorsT()("fallback.banUser", { defaultValue: "Failed to suspend account" }),
      ),
  });

  const unbanMutation = useMutation({
    ...unbanUserMutationOptions,
    onSuccess: () => {
      toast.success(t("users.detail.unbanSuccessToast"));
      void invalidateUser();
    },
    onError: (err) =>
      toastError(
        err,
        getErrorsT()("fallback.unbanUser", { defaultValue: "Failed to reactivate account" }),
      ),
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
    onError: (err) =>
      toastError(
        err,
        getErrorsT()("fallback.startImpersonation", {
          defaultValue: "Failed to start impersonation",
        }),
      ),
  });

  const revokeSessionsMutation = useMutation({
    ...revokeSessionsMutationOptions,
    onSuccess: () => {
      toast.success(t("users.detail.revokeSessionsSuccessToast"));
      void invalidateUser();
    },
    onError: (err) =>
      toastError(
        err,
        getErrorsT()("fallback.revokeUserSessions", { defaultValue: "Failed to revoke sessions" }),
      ),
  });

  const resetPasswordMutation = useMutation({
    ...resetPasswordMutationOptions,
    onSuccess: () => toast.success(t("users.detail.resetPasswordSuccessToast")),
    onError: (err) =>
      toastError(
        err,
        getErrorsT()("fallback.resetUserPassword", {
          defaultValue: "Failed to send password reset",
        }),
      ),
  });

  const setRoleMutation = useMutation({
    ...setRoleMutationOptions,
    onSuccess: () => {
      toast.success(t("users.detail.changeRoleSuccessToast"));
      setRoleOpen(false);
      void invalidateUser();
    },
    onError: (err) =>
      toastError(
        err,
        getErrorsT()("fallback.setUserRole", { defaultValue: "Failed to change role" }),
      ),
  });

  if (query.isLoading) {
    return (
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-10">
        <p>{t("users.detail.loading")}</p>
      </main>
    );
  }

  if (query.isError || !query.data) {
    return (
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-10">
        <p>{t("users.detail.loadFailed")}</p>
      </main>
    );
  }

  const user = query.data;

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-10">
      <header>
        <TypographyH1 variant="page">{user.name}</TypographyH1>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>{t("users.detail.identityTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span>{t("users.table.email")}</span>
              <span>{user.email}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>{t("users.table.role")}</span>
              <span className="flex items-center gap-2">
                {user.role ? (
                  <Badge variant="secondary">
                    {isPlatformRole(user.role) ? t(PLATFORM_ROLE_LABEL_KEYS[user.role]) : user.role}
                  </Badge>
                ) : (
                  "—"
                )}
                <Dialog open={roleOpen} onOpenChange={setRoleOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline" size="sm">
                      {t("users.detail.changeRole")}
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
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
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span>{t("users.detail.twoFactorLabel")}</span>
              <span>
                {user.twoFactorEnabled
                  ? t("users.detail.twoFactorEnabled")
                  : t("users.detail.twoFactorDisabled")}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span>{t("users.detail.memberSinceLabel")}</span>
              <span>{formatDate(user.createdAt)}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card variant={user.banned ? "destructive" : "default"}>
        <CardHeader>
          <CardTitle variant={user.banned ? "destructive" : "default"}>
            {t("users.detail.accountStatusTitle")}
          </CardTitle>
          <CardAction>
            <div className="flex flex-wrap gap-2">
              {user.banned ? (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={unbanMutation.isPending}
                  onClick={() => unbanMutation.mutate(id)}
                >
                  {t("users.detail.reactivate")}
                </Button>
              ) : (
                <Dialog open={banOpen} onOpenChange={setBanOpen}>
                  <DialogTrigger asChild>
                    <Button variant="destructive" size="sm">
                      {t("users.detail.suspend")}
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
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
              <Dialog open={impersonateOpen} onOpenChange={setImpersonateOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm">
                    {t("users.detail.impersonate")}
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>{t("users.detail.impersonateDialogTitle")}</DialogTitle>
                  </DialogHeader>
                  <ImpersonateForm
                    isPending={impersonateMutation.isPending}
                    onSubmit={(values) => impersonateMutation.mutate({ id, ...values })}
                  />
                </DialogContent>
              </Dialog>
            </div>
          </CardAction>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span>{t("users.table.status")}</span>
              <span>
                {user.banned ? (
                  <Badge variant="destructive">{t(USER_STATUS_LABEL_KEYS.suspended)}</Badge>
                ) : (
                  <Badge variant="outline">{t(USER_STATUS_LABEL_KEYS.active)}</Badge>
                )}
              </span>
            </div>
            {user.banReason && (
              <div className="flex items-center justify-between">
                <span>{t("users.detail.reasonLabel")}</span>
                <span>{user.banReason}</span>
              </div>
            )}
            {user.banExpires !== null && (
              <div className="flex items-center justify-between">
                <span>{t("users.detail.expiresLabel")}</span>
                <span>{formatDate(user.banExpires)}</span>
              </div>
            )}
            {user.banned && user.banExpires === null && (
              <div className="flex items-center justify-between">
                <span>{t("users.detail.expiresLabel")}</span>
                <span>{t("users.durationPermanent")}</span>
              </div>
            )}
          </div>
        </CardContent>
        <CardFooter className="flex-wrap gap-2">
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
        </CardFooter>
      </Card>

      <SessionsCard sessions={user.sessions} />
    </main>
  );
}
