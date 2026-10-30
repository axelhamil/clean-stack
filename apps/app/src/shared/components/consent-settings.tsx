import { CONSENT_CATEGORIES, OPTIONAL_CATEGORIES } from "@packages/cookie-consent";
import { Button } from "@packages/ui/components/ui/button";
import { Hint } from "@packages/ui/components/ui/hint";
import { Label } from "@packages/ui/components/ui/label";
import { Switch } from "@packages/ui/components/ui/switch";
import { TypographyH2, TypographyMuted } from "@packages/ui/components/ui/typography";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { toastError } from "../api/errors/toast";
import { recordConsentMutationOptions } from "../api/mutations/record-consent";
import { withdrawConsentMutationOptions } from "../api/mutations/withdraw-consent";
import { consentQueryOptions } from "../api/queries/consent";
import { GuardHint } from "../auth/guard-hint";
import { ImpersonationReason } from "../auth/impersonation-reason";
import { useImpersonationGuard } from "../auth/use-impersonation-guard";
import { errorFallback } from "../i18n/get-errors-t";

type OptionalKey = (typeof OPTIONAL_CATEGORIES)[number];

interface ConsentSettingsProps {
  onSaved?: () => void;
  withTitle?: boolean;
}

export function ConsentSettings({ onSaved, withTitle = true }: ConsentSettingsProps) {
  const { t } = useTranslation("common");
  const queryClient = useQueryClient();
  const { data } = useQuery(consentQueryOptions);
  const guard = useImpersonationGuard();

  const [enabled, setEnabled] = useState<Record<OptionalKey, boolean>>({
    functional: false,
    analytics: false,
    marketing: false,
  });

  useEffect(() => {
    const current = data?.categories;
    setEnabled({
      functional: current?.includes("functional") ?? false,
      analytics: current?.includes("analytics") ?? false,
      marketing: current?.includes("marketing") ?? false,
    });
  }, [data]);

  const settle = async (message: string) => {
    await queryClient.refetchQueries({ queryKey: consentQueryOptions.queryKey });
    toast.success(message);
    onSaved?.();
  };

  const record = useMutation({
    ...recordConsentMutationOptions,
    onSuccess: () => settle(t("cookieConsent.savedToast")),
    onError: (err) => toastError(err, errorFallback("recordConsent")),
  });

  const withdraw = useMutation({
    ...withdrawConsentMutationOptions,
    onSuccess: () => settle(t("cookieConsent.withdrawnToast")),
    onError: (err) => toastError(err, errorFallback("withdrawConsent")),
  });

  const isPending = record.isPending || withdraw.isPending;

  const handleSave = () => {
    const categories = OPTIONAL_CATEGORIES.filter((cat) => enabled[cat]);
    record.mutate({ categories });
  };

  const handleWithdraw = () => {
    withdraw.mutate();
  };

  return (
    <section className="flex flex-col gap-4">
      {withTitle && <TypographyH2>{t("cookieConsent.title")}</TypographyH2>}
      <ImpersonationReason guard={guard} />
      <div className="flex flex-col gap-4">
        {CONSENT_CATEGORIES.map((cat) => {
          const label = t(`cookieConsent.categories.${cat}.label` as const);
          const isNecessary = cat === "necessary";
          const checked = isNecessary || enabled[cat as OptionalKey];
          return (
            <div key={cat} className="flex items-start justify-between gap-4">
              <div className="flex flex-col gap-1">
                <Label htmlFor={`consent-${cat}`}>{label}</Label>
                <TypographyMuted>
                  {t(`cookieConsent.categories.${cat}.description` as const)}
                </TypographyMuted>
              </div>
              <Hint
                text={isNecessary ? t("cookieConsent.necessaryAlwaysOnHint") : guard.reason}
                showOnTouch={false}
              >
                <Switch
                  id={`consent-${cat}`}
                  checked={checked}
                  onCheckedChange={(val) => {
                    if (!isNecessary) setEnabled((prev) => ({ ...prev, [cat]: val }));
                  }}
                  disabled={isNecessary || isPending || guard.blocked}
                  {...guard.describeProps(isNecessary || isPending)}
                  aria-label={label}
                />
              </Hint>
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-2">
        <GuardHint guard={guard} otherwiseDisabled={isPending}>
          <Button
            onClick={handleSave}
            disabled={isPending || guard.blocked}
            {...guard.describeProps(isPending)}
          >
            {t("cookieConsent.save")}
          </Button>
        </GuardHint>
        <GuardHint guard={guard} otherwiseDisabled={isPending}>
          <Button
            variant="outline"
            onClick={handleWithdraw}
            disabled={isPending || guard.blocked}
            {...guard.describeProps(isPending)}
          >
            {t("cookieConsent.withdraw")}
          </Button>
        </GuardHint>
      </div>
    </section>
  );
}
