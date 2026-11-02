import { SettingsSection } from "@packages/ui/components/ui/settings-section";
import { Switch } from "@packages/ui/components/ui/switch";
import { TypographyInline, TypographyMuted } from "@packages/ui/components/ui/typography";
import { toastError } from "@packages/web-kit/api/errors/toast";
import { errorFallback } from "@packages/web-kit/i18n/get-errors-t";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { activeOrgQueryOptions } from "../../../shared/api/queries/active-org";
import { Can } from "../../../shared/auth/can";
import { GuardHint } from "../../../shared/auth/guard-hint";
import { ImpersonationReason } from "../../../shared/auth/impersonation-reason";
import { useImpersonationGuard } from "../../../shared/auth/use-impersonation-guard";
import { QueryLoadError } from "../../../shared/components/query-load-error";
import { setSsoEnforcementMutationOptions } from "../api/sso.mutations";
import { primaryProviderFor, ssoProvidersQueryOptions } from "../api/sso.queries";

// `ssoEnforced` is a server-only additionalField on the organization schema
// (apps/api/src/auth.ts): the organization client isn't generated with knowledge
// of it, so it has to be read through a narrow, explicit cast.
interface OrgWithSsoEnforcement {
  ssoEnforced?: boolean;
}

export function SsoEnforcementCard() {
  const qc = useQueryClient();
  const { t } = useTranslation("settings");
  const guard = useImpersonationGuard();
  const orgQuery = useQuery(activeOrgQueryOptions);
  const org = orgQuery.data;
  const { data: providers } = useQuery(ssoProvidersQueryOptions);
  const provider = primaryProviderFor(providers, org?.id);
  const hasVerifiedProvider = provider?.domainVerified === true;
  const enforced = (org as OrgWithSsoEnforcement | undefined)?.ssoEnforced ?? false;

  const setEnforcement = useMutation({
    ...setSsoEnforcementMutationOptions,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: activeOrgQueryOptions.queryKey });
      toast.success(t("sso.enforcementCard.updatedToast"));
    },
    onError: (err) => toastError(err, errorFallback("updateSsoEnforcement")),
  });

  // A verified-domain gap already freezes the switch on its own; `describeProps`
  // is what keeps the tooltip from naming impersonation in that case.
  const otherwiseFrozen = setEnforcement.isPending || (!enforced && !hasVerifiedProvider);

  return (
    <Can requires={{ organization: ["update"] }}>
      <SettingsSection
        title={t("sso.enforcementCard.title")}
        description={t("sso.enforcementCard.description")}
      >
        {orgQuery.isLoadingError ? (
          <QueryLoadError
            message={t("sso.enforcementCard.loadFailed")}
            isFetching={orgQuery.isFetching}
            onRetry={() => void orgQuery.refetch()}
          />
        ) : (
          <>
            <div className="flex items-center gap-3">
              <GuardHint guard={guard} otherwiseDisabled={otherwiseFrozen}>
                <Switch
                  aria-label={t("sso.enforcementCard.switchAriaLabel")}
                  checked={enforced}
                  disabled={otherwiseFrozen || guard.blocked}
                  {...guard.describeProps(otherwiseFrozen)}
                  onCheckedChange={(next) => setEnforcement.mutate(next)}
                />
              </GuardHint>
              <TypographyInline size="sm">
                {enforced
                  ? t("sso.enforcementCard.enforcedLabel")
                  : t("sso.enforcementCard.notEnforcedLabel")}
              </TypographyInline>
            </div>
            {!enforced && !hasVerifiedProvider && (
              <TypographyMuted>{t("sso.enforcementCard.verifyDomainFirst")}</TypographyMuted>
            )}
            <ImpersonationReason guard={guard} />
          </>
        )}
      </SettingsSection>
    </Can>
  );
}
