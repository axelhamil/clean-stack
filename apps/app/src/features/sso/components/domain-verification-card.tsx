import { Alert, AlertDescription } from "@packages/ui/components/ui/alert";
import { Badge } from "@packages/ui/components/ui/badge";
import { Button } from "@packages/ui/components/ui/button";
import { SettingsSection } from "@packages/ui/components/ui/settings-section";
import { TypographyMuted } from "@packages/ui/components/ui/typography";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { activeOrgQueryOptions } from "../../../shared/api/queries/active-org";
import { verifyDomainMutationOptions } from "../api/sso.mutations";
import {
  domainVerificationTokenQueryOptions,
  primaryProviderFor,
  ssoProvidersQueryOptions,
} from "../api/sso.queries";
import { CopyRow } from "./copy-row";

export function DomainVerificationCard() {
  const qc = useQueryClient();
  const { t } = useTranslation(["settings", "errors"]);
  const { data: org } = useQuery(activeOrgQueryOptions);
  const { data: providers } = useQuery(ssoProvidersQueryOptions);
  const provider = primaryProviderFor(providers, org?.id);

  const token = useQuery({
    ...domainVerificationTokenQueryOptions(provider?.providerId ?? ""),
    enabled: Boolean(provider) && provider?.domainVerified === false,
  });

  const verify = useMutation({
    ...verifyDomainMutationOptions,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ssoProvidersQueryOptions.queryKey });
      toast.success(t("settings:sso.domainCard.verifiedToast"));
    },
    onError: (err) =>
      toast.error(
        err.message === "DOMAIN_VERIFIED"
          ? t("settings:sso.domainCard.alreadyVerified")
          : t("settings:sso.domainCard.verifyFailed"),
      ),
  });

  return (
    <SettingsSection
      title={t("settings:sso.domainCard.title")}
      description={t("settings:sso.domainCard.description")}
    >
      {!provider ? (
        <TypographyMuted>{t("settings:sso.registerProviderFirst")}</TypographyMuted>
      ) : provider.domainVerified ? (
        <Badge>{t("settings:sso.domainCard.verifiedBadge")}</Badge>
      ) : (
        <>
          <Badge variant="secondary">{t("settings:sso.domainCard.unverifiedBadge")}</Badge>
          {token.isError && (
            <Alert variant="destructive">
              <AlertDescription>{t("errors:fallback.loadSsoVerificationToken")}</AlertDescription>
            </Alert>
          )}
          {token.data && (
            <div className="flex flex-col gap-3">
              <CopyRow
                label={t("settings:sso.domainCard.txtNameLabel")}
                value={`_better-auth-token-${provider.providerId}.${provider.domain}`}
              />
              <CopyRow label={t("settings:sso.domainCard.txtValueLabel")} value={token.data} />
            </div>
          )}
          <Button
            className="w-fit"
            disabled={verify.isPending}
            onClick={() => verify.mutate(provider.providerId)}
          >
            {t("settings:sso.domainCard.checkNowAction")}
          </Button>
        </>
      )}
    </SettingsSection>
  );
}
