import { OPTIONAL_CATEGORIES } from "@packages/cookie-consent";
import { Button } from "@packages/ui/components/ui/button";
import { Card, CardContent, CardHeader } from "@packages/ui/components/ui/card";
import { Label } from "@packages/ui/components/ui/label";
import { Switch } from "@packages/ui/components/ui/switch";
import { TypographyH2, TypographyMuted } from "@packages/ui/components/ui/typography";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { recordConsentMutationOptions } from "../api/mutations/record-consent";
import { withdrawConsentMutationOptions } from "../api/mutations/withdraw-consent";
import { consentQueryOptions } from "../api/queries/consent";

type OptionalKey = "functional" | "analytics" | "marketing";

const ALL_CATEGORIES = ["necessary", "functional", "analytics", "marketing"] as const;
type AllCategory = (typeof ALL_CATEGORIES)[number];

interface ConsentSettingsProps {
  onSaved?: () => void;
}

export function ConsentSettings({ onSaved }: ConsentSettingsProps) {
  const { t } = useTranslation("common");
  const queryClient = useQueryClient();
  const { data } = useQuery(consentQueryOptions);

  const [enabled, setEnabled] = useState<Record<OptionalKey, boolean>>({
    functional: false,
    analytics: false,
    marketing: false,
  });

  useEffect(() => {
    const current = (data as { categories?: string[] | null } | undefined)?.categories;
    setEnabled({
      functional: current?.includes("functional") ?? false,
      analytics: current?.includes("analytics") ?? false,
      marketing: current?.includes("marketing") ?? false,
    });
  }, [data]);

  const record = useMutation({
    ...recordConsentMutationOptions,
    onSuccess: async () => {
      await queryClient.refetchQueries({ queryKey: consentQueryOptions.queryKey });
      toast.success(t("cookieConsent.savedToast"));
      onSaved?.();
    },
  });

  const withdraw = useMutation({
    ...withdrawConsentMutationOptions,
    onSuccess: async () => {
      await queryClient.refetchQueries({ queryKey: consentQueryOptions.queryKey });
      toast.success(t("cookieConsent.withdrawnToast"));
      onSaved?.();
    },
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
    <Card>
      <CardHeader>
        <TypographyH2>{t("cookieConsent.title")}</TypographyH2>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <div className="flex flex-col gap-4">
          {ALL_CATEGORIES.map((cat: AllCategory) => {
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
                <Switch
                  id={`consent-${cat}`}
                  checked={checked}
                  onCheckedChange={(val) => {
                    if (!isNecessary) setEnabled((prev) => ({ ...prev, [cat]: val }));
                  }}
                  disabled={isNecessary || isPending}
                  aria-label={label}
                />
              </div>
            );
          })}
        </div>
        <div className="flex gap-2">
          <Button onClick={handleSave} disabled={isPending}>
            {t("cookieConsent.save")}
          </Button>
          <Button variant="outline" onClick={handleWithdraw} disabled={isPending}>
            {t("cookieConsent.withdraw")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
