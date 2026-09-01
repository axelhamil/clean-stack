import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@packages/ui/components/ui/card";
import { Switch } from "@packages/ui/components/ui/switch";
import { TypographyMuted } from "@packages/ui/components/ui/typography";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { toastError } from "../../../shared/api/errors/toast";
import { activeOrgQueryOptions } from "../../../shared/api/queries/active-org";
import { Can } from "../../../shared/auth/can";
import { ImpersonationReason } from "../../../shared/auth/impersonation-reason";
import { useImpersonationGuard } from "../../../shared/auth/use-impersonation-guard";
import { getErrorsT } from "../../../shared/i18n/get-errors-t";
import { setSsoEnforcementMutationOptions } from "../api/sso.mutations";
import { primaryProviderFor, ssoProvidersQueryOptions } from "../api/sso.queries";

// `ssoEnforced` is a server-only additionalField on the organization schema
// (apps/api/src/auth.ts) — the organization client isn't generated with knowledge
// of it, so it has to be read through a narrow, explicit cast.
interface OrgWithSsoEnforcement {
  ssoEnforced?: boolean;
}

export function SsoEnforcementCard() {
  const qc = useQueryClient();
  const { t } = useTranslation("settings");
  const guard = useImpersonationGuard();
  const { data: org } = useQuery(activeOrgQueryOptions);
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
    onError: (err) =>
      toastError(
        err,
        getErrorsT()("fallback.updateSsoEnforcement", {
          defaultValue: "Failed to update SSO enforcement",
        }),
      ),
  });

  // A verified-domain gap already freezes the switch on its own — only
  // attribute the freeze to impersonation when that is actually the cause,
  // otherwise the tooltip would name a reason that isn't why the control is
  // stuck.
  const otherwiseFrozen = setEnforcement.isPending || (!enforced && !hasVerifiedProvider);
  const impersonationFrozen = guard.blocked && !otherwiseFrozen;

  return (
    <Can requires={{ organization: ["update"] }}>
      <Card>
        <CardHeader>
          <CardTitle>{t("sso.enforcementCard.title")}</CardTitle>
          <CardDescription>{t("sso.enforcementCard.description")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <Switch
              aria-label={t("sso.enforcementCard.switchAriaLabel")}
              checked={enforced}
              disabled={otherwiseFrozen || guard.blocked}
              title={impersonationFrozen ? guard.reason : undefined}
              aria-describedby={impersonationFrozen ? guard.descriptionId : undefined}
              onCheckedChange={(next) => setEnforcement.mutate(next)}
            />
            <span className="text-sm">
              {enforced
                ? t("sso.enforcementCard.enforcedLabel")
                : t("sso.enforcementCard.notEnforcedLabel")}
            </span>
          </div>
          {!enforced && !hasVerifiedProvider && (
            <TypographyMuted>{t("sso.enforcementCard.verifyDomainFirst")}</TypographyMuted>
          )}
        </CardContent>
      </Card>
      <ImpersonationReason guard={guard} />
    </Can>
  );
}
