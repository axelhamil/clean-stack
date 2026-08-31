import { isPersonalOrg } from "@packages/access-control";
import { Alert, AlertDescription } from "@packages/ui/components/ui/alert";
import { Button } from "@packages/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@packages/ui/components/ui/card";
import { DestructiveActionDialog } from "@packages/ui/components/ui/destructive-action-dialog";
import { navLinkVariants } from "@packages/ui/components/ui/nav-link";
import { TypographyMuted } from "@packages/ui/components/ui/typography";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { AlertTriangleIcon } from "lucide-react";
import { Trans, useTranslation } from "react-i18next";
import { toast } from "sonner";
import { toastError } from "../../../shared/api/errors/toast";
import { deleteOrgMutationOptions } from "../../../shared/api/mutations/delete-org";
import { leaveOrgMutationOptions } from "../../../shared/api/mutations/leave-org";
import { transferAndLeaveMutationOptions } from "../../../shared/api/mutations/transfer-and-leave";
import { activeOrgQueryOptions } from "../../../shared/api/queries/active-org";
import { currentMembershipQueryOptions } from "../../../shared/api/queries/current-membership";
import { orgMembersQueryOptions } from "../../../shared/api/queries/org-members";
import { orgsListQueryOptions } from "../../../shared/api/queries/orgs-list";
import { broadcastAuthChange } from "../../../shared/auth/auth-broadcast";
import { Can } from "../../../shared/auth/can";
import { useAuthorization } from "../../../shared/auth/use-authorization";
import { useSetActiveOrg } from "../../../shared/auth/use-set-active-org";
import { TransferLeaveDialog } from "./transfer-leave-dialog";

export function OrgDangerCard() {
  const { t } = useTranslation("settings");
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: org } = useQuery(activeOrgQueryOptions);
  const { role } = useAuthorization();
  const { switchOrg } = useSetActiveOrg();
  const { data: membership } = useQuery(currentMembershipQueryOptions);
  const { data: members = [] } = useQuery(
    org ? orgMembersQueryOptions(org.id) : { ...orgMembersQueryOptions(""), enabled: false },
  );

  const onLeaveSuccess = async () => {
    const orgs = await queryClient.fetchQuery(orgsListQueryOptions);
    if (orgs[0]) {
      await switchOrg(orgs[0].id);
    } else {
      broadcastAuthChange();
    }
    toast.success(t("organization.leftOrgToast"));
    void navigate({ to: "/dashboard" });
  };

  const leave = useMutation({
    ...leaveOrgMutationOptions,
    onSuccess: onLeaveSuccess,
    onError: (err) => toastError(err, t("organization.leaveFailed")),
  });

  const transferAndLeave = useMutation({
    ...transferAndLeaveMutationOptions,
    onSuccess: onLeaveSuccess,
    onError: (err) => toastError(err, t("organization.transferAndLeaveFailed")),
  });

  const remove = useMutation({
    ...deleteOrgMutationOptions,
    onSuccess: async () => {
      await Promise.all([
        queryClient.refetchQueries({ queryKey: activeOrgQueryOptions.queryKey }),
        queryClient.refetchQueries({ queryKey: orgsListQueryOptions.queryKey }),
      ]);
      broadcastAuthChange();
      toast.success(t("organization.orgDeletedToast"));
      void navigate({ to: "/dashboard" });
    },
    onError: (err) => toastError(err, t("organization.deleteFailed")),
  });

  if (!org) return null;

  const owners = members.filter((m) => m.role === "owner");
  const needsTransfer = role === "owner" && owners.length === 1 && members.length > 1;
  const personal = isPersonalOrg(org.slug);

  return (
    <>
      {!personal && (
        <Can requires={{ organization: ["leave"] }}>
          <Card>
            <CardHeader>
              <CardTitle variant="destructive">{t("organization.leaveOrgLabel")}</CardTitle>
              <CardDescription>{t("organization.leaveOrgCardDescription")}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <Alert variant="destructive">
                <AlertTriangleIcon />
                <AlertDescription>
                  <Trans
                    ns="settings"
                    i18nKey="organization.leaveOrgAlertDescription"
                    components={{ orgName: <strong>{org.name}</strong> }}
                  />
                </AlertDescription>
              </Alert>
              {needsTransfer ? (
                <TransferLeaveDialog
                  org={{ id: org.id, name: org.name }}
                  members={members}
                  currentUserId={membership?.userId ?? ""}
                  isPending={transferAndLeave.isPending}
                  onConfirm={(newOwnerMemberId) =>
                    transferAndLeave.mutate({ organizationId: org.id, newOwnerMemberId })
                  }
                  trigger={
                    <Button
                      variant="destructive"
                      className="self-start"
                      disabled={transferAndLeave.isPending}
                    >
                      {t("organization.leaveOrgLabel")}
                    </Button>
                  }
                />
              ) : (
                <DestructiveActionDialog
                  trigger={
                    <Button variant="destructive" className="self-start" disabled={leave.isPending}>
                      {t("organization.leaveOrgLabel")}
                    </Button>
                  }
                  title={t("organization.leaveOrgLabel")}
                  description={
                    <Trans
                      ns="settings"
                      i18nKey="organization.leaveOrgDialogDescription"
                      components={{ orgName: <strong>{org.name}</strong> }}
                    />
                  }
                  actionLabel={t("organization.leaveOrgLabel")}
                  isPending={leave.isPending}
                  onConfirm={() => leave.mutate({ organizationId: org.id })}
                />
              )}
            </CardContent>
          </Card>
        </Can>
      )}
      <Can requires={{ organization: ["delete"] }}>
        <Card>
          <CardHeader>
            <CardTitle variant="destructive">{t("organization.deleteOrgLabel")}</CardTitle>
            <CardDescription>
              {personal
                ? t("organization.deleteOrgDescriptionPersonal")
                : t("organization.deleteOrgDescriptionRegular")}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {personal ? (
              <TypographyMuted>
                <Trans
                  ns="settings"
                  i18nKey="organization.deleteAccountToRemoveOrg"
                  components={{
                    accountLink: (
                      <Link
                        to="/settings/account"
                        className={navLinkVariants({ variant: "underline" })}
                      />
                    ),
                  }}
                />
              </TypographyMuted>
            ) : (
              <>
                <Alert variant="destructive">
                  <AlertTriangleIcon />
                  <AlertDescription>
                    <Trans
                      ns="settings"
                      i18nKey="organization.deleteOrgAlertDescription"
                      components={{ orgName: <strong>{org.name}</strong> }}
                    />
                  </AlertDescription>
                </Alert>
                <DestructiveActionDialog
                  trigger={
                    <Button
                      variant="destructive"
                      className="self-start"
                      disabled={remove.isPending}
                    >
                      {t("organization.deleteOrgLabel")}
                    </Button>
                  }
                  title={t("organization.deleteOrgLabel")}
                  description={t("organization.deleteOrgDialogDescription")}
                  confirmText={org.name}
                  actionLabel={t("organization.deleteOrgLabel")}
                  isPending={remove.isPending}
                  onConfirm={() => remove.mutate({ organizationId: org.id })}
                />
              </>
            )}
          </CardContent>
        </Card>
      </Can>
    </>
  );
}
