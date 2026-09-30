import { COOKIE_CONSENT_VERSION, OPTIONAL_CATEGORIES } from "@packages/cookie-consent";
import { BottomBanner } from "@packages/ui/components/ui/bottom-banner";
import { Button } from "@packages/ui/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@packages/ui/components/ui/dialog";
import { TextLink } from "@packages/ui/components/ui/text-link";
import { TypographyMuted } from "@packages/ui/components/ui/typography";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { recordConsentMutationOptions } from "../api/mutations/record-consent";
import { consentQueryOptions } from "../api/queries/consent";
import { ConsentSettings } from "./consent-settings";

export function CookieBanner() {
  const { t } = useTranslation("common");
  const queryClient = useQueryClient();
  const { data } = useQuery(consentQueryOptions);
  const [customizeOpen, setCustomizeOpen] = useState(false);

  const record = useMutation({
    ...recordConsentMutationOptions,
    onSuccess: async () => {
      await queryClient.refetchQueries({ queryKey: consentQueryOptions.queryKey });
    },
  });

  if (data === undefined) return null;

  const categories = data.categories ?? null;
  const policyVersion = data.policyVersion ?? null;

  if (categories !== null && policyVersion === COOKIE_CONSENT_VERSION) return null;

  const handleAcceptAll = () => {
    record.mutate({ categories: [...OPTIONAL_CATEGORIES] });
  };

  const handleRejectAll = () => {
    record.mutate({ categories: [] });
  };

  return (
    <>
      <BottomBanner role="dialog" aria-label={t("cookieBanner.ariaLabel")} aria-modal="false">
        <TypographyMuted className="flex-1">
          {t("cookieBanner.message")}{" "}
          <TextLink href="/legal/cookies">{t("cookieBanner.policyLink")}</TextLink>.
        </TypographyMuted>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={handleRejectAll} disabled={record.isPending}>
            {t("cookieBanner.rejectAll")}
          </Button>
          <Button variant="outline" onClick={() => setCustomizeOpen(true)}>
            {t("cookieBanner.customize")}
          </Button>
          <Button variant="outline" onClick={handleAcceptAll} disabled={record.isPending}>
            {t("cookieBanner.acceptAll")}
          </Button>
        </div>
      </BottomBanner>
      <Dialog open={customizeOpen} onOpenChange={setCustomizeOpen}>
        <DialogContent closeLabel={t("actions.close")} className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("cookieBanner.preferencesTitle")}</DialogTitle>
          </DialogHeader>
          <ConsentSettings onSaved={() => setCustomizeOpen(false)} />
        </DialogContent>
      </Dialog>
    </>
  );
}
