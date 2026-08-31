import { Badge } from "@packages/ui/components/ui/badge";
import { Button } from "@packages/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@packages/ui/components/ui/card";
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
  const { t } = useTranslation("settings");
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
      toast.success(t("sso.domainCard.verifiedToast"));
    },
    onError: (err) =>
      toast.error(
        err.message === "DOMAIN_VERIFIED"
          ? t("sso.domainCard.alreadyVerified")
          : t("sso.domainCard.verifyFailed"),
      ),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("sso.domainCard.title")}</CardTitle>
        <CardDescription>{t("sso.domainCard.description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {!provider ? (
          <TypographyMuted>{t("sso.registerProviderFirst")}</TypographyMuted>
        ) : provider.domainVerified ? (
          <Badge>{t("sso.domainCard.verifiedBadge")}</Badge>
        ) : (
          <>
            <Badge variant="secondary">{t("sso.domainCard.unverifiedBadge")}</Badge>
            {token.data && (
              <div className="flex flex-col gap-3">
                <CopyRow
                  label={t("sso.domainCard.txtNameLabel")}
                  value={`_better-auth-token-${provider.providerId}.${provider.domain}`}
                />
                <CopyRow label={t("sso.domainCard.txtValueLabel")} value={token.data} />
              </div>
            )}
            <Button
              variant="outline"
              className="w-fit"
              disabled={verify.isPending}
              onClick={() => verify.mutate(provider.providerId)}
            >
              {t("sso.domainCard.checkNowAction")}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
