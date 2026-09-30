import { Button } from "@packages/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@packages/ui/components/ui/card";
import { DestructiveActionDialog } from "@packages/ui/components/ui/destructive-action-dialog";
import { TypographyMuted } from "@packages/ui/components/ui/typography";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { toastError } from "../../../shared/api/errors/toast";
import { activeOrgQueryOptions } from "../../../shared/api/queries/active-org";
import { ImpersonationReason } from "../../../shared/auth/impersonation-reason";
import { useAuthorization } from "../../../shared/auth/use-authorization";
import { useImpersonationGuard } from "../../../shared/auth/use-impersonation-guard";
import { SecretRevealDialog } from "../../../shared/components/secret-reveal-dialog";
import { env } from "../../../shared/env";
import { errorFallback } from "../../../shared/i18n/get-errors-t";
import { useFormatDate } from "../../../shared/i18n/use-format-date";
import { disconnectScimMutationOptions, issueScimTokenMutationOptions } from "../api/sso.mutations";
import {
  primaryProviderFor,
  scimConnectionQueryOptions,
  ssoProvidersQueryOptions,
} from "../api/sso.queries";
import { CopyRow } from "./copy-row";

const SCIM_BASE_URL = `${env.VITE_API_URL}/api/auth/scim/v2`;

export function ScimConnectionCard() {
  const { t } = useTranslation(["settings", "common"]);
  const qc = useQueryClient();
  const guard = useImpersonationGuard();
  const formatDate = useFormatDate();
  const { data: org } = useQuery(activeOrgQueryOptions);
  const { data: providers } = useQuery(ssoProvidersQueryOptions);
  const { can } = useAuthorization();
  const [revealToken, setRevealToken] = useState<string | null>(null);

  const provider = primaryProviderFor(providers, org?.id);
  const canManage = can({ scim: ["manage"] });
  const { data: connection } = useQuery({
    ...scimConnectionQueryOptions,
    enabled: canManage && provider !== undefined,
  });

  const refreshConnection = () =>
    qc.invalidateQueries({ queryKey: scimConnectionQueryOptions.queryKey });

  const issue = useMutation({
    ...issueScimTokenMutationOptions,
    onSuccess: ({ token }) => {
      setRevealToken(token);
      void refreshConnection();
    },
    onError: (err) => toastError(err, errorFallback("generateScimToken")),
  });

  const disconnect = useMutation({
    ...disconnectScimMutationOptions,
    onSuccess: () => {
      toast.success(t("sso.scimCard.disconnectedToast"));
      void refreshConnection();
    },
    onError: (err) => toastError(err, errorFallback("disconnectScim")),
  });

  const pending = issue.isPending || disconnect.isPending;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("sso.scimCard.title")}</CardTitle>
        <CardDescription>{t("sso.scimCard.description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {!provider ? (
          <TypographyMuted>{t("sso.registerProviderFirst")}</TypographyMuted>
        ) : !canManage ? (
          <TypographyMuted>{t("sso.scimCard.onlyOwnerCanGenerate")}</TypographyMuted>
        ) : (
          <>
            <CopyRow label={t("sso.scimCard.baseUrlLabel")} value={SCIM_BASE_URL} />
            <TypographyMuted>
              {connection?.tokenExpiresAt
                ? t("sso.scimCard.connectedUntil", { date: formatDate(connection.tokenExpiresAt) })
                : t("sso.scimCard.notConnected")}
            </TypographyMuted>
            <div className="flex flex-wrap gap-2">
              <Button
                disabled={pending || guard.blocked}
                {...guard.describeProps(pending)}
                onClick={() => issue.mutate()}
              >
                {connection ? t("sso.scimCard.rotateAction") : t("sso.scimCard.generateAction")}
              </Button>
              {connection && (
                <DestructiveActionDialog
                  trigger={
                    <Button
                      variant="destructive"
                      disabled={pending || guard.blocked}
                      {...guard.describeProps(pending)}
                    >
                      {t("sso.scimCard.disconnectAction")}
                    </Button>
                  }
                  title={t("sso.scimCard.disconnectDialogTitle")}
                  description={t("sso.scimCard.disconnectDialogDescription")}
                  actionLabel={t("sso.scimCard.disconnectAction")}
                  cancelLabel={t("common:actions.cancel")}
                  isPending={disconnect.isPending}
                  onConfirm={() => disconnect.mutate()}
                />
              )}
            </div>
          </>
        )}
      </CardContent>

      <ImpersonationReason guard={guard} />
      <SecretRevealDialog
        secret={revealToken}
        onClose={() => setRevealToken(null)}
        title={t("sso.scimCard.secretDialogTitle")}
        description={t("sso.scimCard.secretDialogDescription")}
      />
    </Card>
  );
}
