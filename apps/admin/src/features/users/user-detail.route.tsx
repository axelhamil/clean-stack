import { BanForm } from "@packages/staff-ui/ban-form";
import { ImpersonateForm } from "@packages/staff-ui/impersonate-form";
import { SessionsSection } from "@packages/staff-ui/sessions-section";
import { Badge } from "@packages/ui/components/ui/badge";
import { Button } from "@packages/ui/components/ui/button";
import {
  DescriptionDetails,
  DescriptionItem,
  DescriptionList,
  DescriptionTerm,
} from "@packages/ui/components/ui/description-list";
import { DestructiveActionDialog } from "@packages/ui/components/ui/destructive-action-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@packages/ui/components/ui/dialog";
import { NavLink } from "@packages/ui/components/ui/nav-link";
import { PageHeader } from "@packages/ui/components/ui/page-header";
import { Separator } from "@packages/ui/components/ui/separator";
import { TypographyH2, TypographyMuted } from "@packages/ui/components/ui/typography";
import { toastError } from "@packages/web-kit/api/errors/toast";
import { errorFallback } from "@packages/web-kit/i18n/get-errors-t";
import { useFormatDate } from "@packages/web-kit/i18n/use-format-date";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { openApprovalIdOf } from "../../shared/api/approval-outcome";
import { requireSection } from "../../shared/auth/require-section";
import { useStaff } from "../../shared/auth/use-staff";
import { AwaitingApprovalNotice } from "../../shared/components/awaiting-approval-notice";
import { BackIcon, BackLink } from "../../shared/components/back-link";
import { DetailState } from "../../shared/components/detail-state";
import { env } from "../../shared/env";
import { orgRoleLabelKey } from "../../shared/labels/org-role";
import {
  banUserMutationOptions,
  resetPasswordMutationOptions,
  revokeSessionsMutationOptions,
  startImpersonationMutationOptions,
  unbanUserMutationOptions,
} from "./api/users.mutations";
import { userQueryOptions } from "./api/users.queries";

export const Route = createFileRoute("/_staff/users/$id")({
  beforeLoad: requireSection("users"),
  component: UserDetailPage,
});

function UserDetailPage() {
  const { t } = useTranslation(["admin", "common"]);
  const formatDate = useFormatDate();
  const { id } = Route.useParams();
  const { can, me } = useStaff();
  const queryClient = useQueryClient();
  const [banOpen, setBanOpen] = useState(false);
  const [impersonateOpen, setImpersonateOpen] = useState(false);
  const [awaitingId, setAwaitingId] = useState<string | null>(null);
  const query = useQuery(userQueryOptions(id));

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["admin", "users"] });

  const ban = useMutation({
    ...banUserMutationOptions,
    onSuccess: (approvalId) => {
      setBanOpen(false);
      setAwaitingId(approvalId);
      toast.success(
        t(approvalId ? "users.detail.banPendingToast" : "users.detail.banSuccessToast"),
      );
      void refresh();
    },
    onError: (err) => {
      toastError(err, errorFallback("banUser"));
      const openId = openApprovalIdOf(err);
      if (openId) setAwaitingId(openId);
    },
  });
  const unban = useMutation({
    ...unbanUserMutationOptions,
    onSuccess: () => {
      toast.success(t("users.detail.unbanSuccessToast"));
      void refresh();
    },
    onError: (err) => toastError(err, errorFallback("unbanUser")),
  });
  const revokeSessions = useMutation({
    ...revokeSessionsMutationOptions,
    onSuccess: () => {
      toast.success(t("users.detail.revokeSessionsSuccessToast"));
      void refresh();
    },
    onError: (err) => toastError(err, errorFallback("revokeUserSessions")),
  });
  const resetPassword = useMutation({
    ...resetPasswordMutationOptions,
    onSuccess: () => toast.success(t("users.detail.resetPasswordSuccessToast")),
    onError: (err) => toastError(err, errorFallback("resetUserPassword")),
  });
  const impersonate = useMutation({
    ...startImpersonationMutationOptions,
    onSuccess: () => window.location.assign(`${env.VITE_APP_URL}/dashboard`),
    onError: (err) => toastError(err, errorFallback("startImpersonation")),
  });

  return (
    <DetailState
      query={query}
      fallbackTitle={t("users.pageTitle")}
      loadingLabel={t("users.detail.loading")}
      errorMessage={t("users.detail.loadFailed")}
      back={
        <BackLink
          link={
            <Link to="/users">
              <BackIcon />
              {t("users.pageTitle")}
            </Link>
          }
        />
      }
    >
      {(user) => (
        <>
          <PageHeader
            title={user.name || user.email}
            actions={
              can("users.impersonate") &&
              user.id !== me.id && (
                <Dialog open={impersonateOpen} onOpenChange={setImpersonateOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline">{t("users.detail.impersonate")}</Button>
                  </DialogTrigger>
                  <DialogContent closeLabel={t("common:actions.close")}>
                    <DialogHeader>
                      <DialogTitle>{t("users.detail.impersonateDialogTitle")}</DialogTitle>
                    </DialogHeader>
                    <ImpersonateForm
                      isPending={impersonate.isPending}
                      onSubmit={(values) => impersonate.mutate({ id, ...values })}
                    />
                  </DialogContent>
                </Dialog>
              )
            }
          />

          {awaitingId && (
            <AwaitingApprovalNotice approvalId={awaitingId} onClosed={() => setAwaitingId(null)} />
          )}

          <div className="grid gap-8 md:grid-cols-2">
            <section className="flex min-w-0 flex-col gap-4">
              <TypographyH2>{t("users.detail.identityTitle")}</TypographyH2>
              <DescriptionList layout="inline">
                <DescriptionItem className="gap-4">
                  <DescriptionTerm className="shrink-0">{t("users.table.email")}</DescriptionTerm>
                  <DescriptionDetails className="min-w-0 wrap-anywhere">
                    {user.email}
                  </DescriptionDetails>
                </DescriptionItem>
                <DescriptionItem>
                  <DescriptionTerm>{t("users.detail.twoFactorLabel")}</DescriptionTerm>
                  <DescriptionDetails>
                    {t(
                      user.twoFactorEnabled
                        ? "users.detail.twoFactorEnabled"
                        : "users.detail.twoFactorDisabled",
                    )}
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
                    <Badge variant={user.banned ? "destructive" : "outline"}>
                      {t(user.banned ? "users.status.suspended" : "users.status.active")}
                    </Badge>
                  </DescriptionDetails>
                </DescriptionItem>
                {user.banReason && (
                  <DescriptionItem className="gap-4">
                    <DescriptionTerm className="shrink-0">
                      {t("users.detail.reasonLabel")}
                    </DescriptionTerm>
                    <DescriptionDetails className="min-w-0 wrap-anywhere">
                      {user.banReason}
                    </DescriptionDetails>
                  </DescriptionItem>
                )}
                {user.banned && (
                  <DescriptionItem>
                    <DescriptionTerm>{t("users.detail.expiresLabel")}</DescriptionTerm>
                    <DescriptionDetails>
                      {user.banExpires ? formatDate(user.banExpires) : t("users.durationPermanent")}
                    </DescriptionDetails>
                  </DescriptionItem>
                )}
              </DescriptionList>

              {can("users.moderate") && (
                <div className="flex flex-wrap gap-2">
                  {user.banned && (
                    <Button size="sm" disabled={unban.isPending} onClick={() => unban.mutate(id)}>
                      {t("users.detail.reactivate")}
                    </Button>
                  )}
                  <DestructiveActionDialog
                    trigger={
                      <Button variant="outline" size="sm" disabled={revokeSessions.isPending}>
                        {t("users.detail.revokeSessions")}
                      </Button>
                    }
                    title={t("users.detail.revokeSessionsConfirmTitle")}
                    description={t("users.detail.revokeSessionsConfirmDescription")}
                    actionLabel={t("users.detail.revokeSessions")}
                    cancelLabel={t("common:actions.cancel")}
                    isPending={revokeSessions.isPending}
                    onConfirm={() => revokeSessions.mutate(id)}
                  />
                  <DestructiveActionDialog
                    trigger={
                      <Button variant="outline" size="sm" disabled={resetPassword.isPending}>
                        {t("users.detail.resetPassword")}
                      </Button>
                    }
                    title={t("users.detail.resetPasswordConfirmTitle")}
                    description={t("users.detail.resetPasswordConfirmDescription")}
                    actionLabel={t("users.detail.resetPassword")}
                    cancelLabel={t("common:actions.cancel")}
                    isPending={resetPassword.isPending}
                    onConfirm={() => resetPassword.mutate(id)}
                  />
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
                          isPending={ban.isPending}
                          onSubmit={(values) => ban.mutate({ id, ...values })}
                        />
                      </DialogContent>
                    </Dialog>
                  )}
                </div>
              )}
            </section>
          </div>

          <Separator />

          <section className="flex min-w-0 flex-col gap-4">
            <TypographyH2>{t("users.detail.membershipsTitle")}</TypographyH2>
            {user.memberships.length === 0 ? (
              <TypographyMuted>{t("users.detail.membershipsEmpty")}</TypographyMuted>
            ) : (
              <DescriptionList layout="inline">
                {user.memberships.map((membership) => {
                  const roleKey = orgRoleLabelKey(membership.role);

                  return (
                    <DescriptionItem key={membership.organizationId} className="gap-4">
                      <DescriptionTerm className="min-w-0 wrap-anywhere">
                        {can("orgs.read") ? (
                          <NavLink asChild variant="plain">
                            <Link to="/orgs/$id" params={{ id: membership.organizationId }}>
                              {membership.organizationName}
                            </Link>
                          </NavLink>
                        ) : (
                          membership.organizationName
                        )}
                      </DescriptionTerm>
                      <DescriptionDetails className="shrink-0">
                        {roleKey ? t(roleKey) : membership.role}
                      </DescriptionDetails>
                    </DescriptionItem>
                  );
                })}
              </DescriptionList>
            )}
          </section>

          <Separator />

          <SessionsSection sessions={user.sessions} />
        </>
      )}
    </DetailState>
  );
}
