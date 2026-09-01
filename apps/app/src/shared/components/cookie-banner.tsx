import { COOKIE_CONSENT_VERSION, OPTIONAL_CATEGORIES } from "@packages/cookie-consent";
import { Button } from "@packages/ui/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@packages/ui/components/ui/dialog";
import { pageContainerVariants } from "@packages/ui/components/ui/page-container";
import { TextLink } from "@packages/ui/components/ui/text-link";
import { TypographyMuted } from "@packages/ui/components/ui/typography";
import { cn } from "@packages/ui/libs/utils.js";
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

  const rawCategories = (data as { categories?: string[] | null }).categories ?? null;
  const rawPolicyVersion = (data as { policyVersion?: string | null }).policyVersion ?? null;

  if (rawCategories !== null && rawPolicyVersion === COOKIE_CONSENT_VERSION) return null;

  const handleAcceptAll = () => {
    record.mutate({ categories: [...OPTIONAL_CATEGORIES] });
  };

  const handleRejectAll = () => {
    record.mutate({ categories: [] });
  };

  return (
    <>
      <div
        role="dialog"
        aria-label={t("cookieBanner.ariaLabel")}
        aria-modal="false"
        className="fixed bottom-0 left-0 right-0 z-50 border-t bg-background shadow-lg"
      >
        <div
          className={cn(
            pageContainerVariants(),
            "flex flex-col gap-4 py-4 md:flex-row md:items-center md:justify-between md:py-6",
          )}
        >
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
        </div>
      </div>
      <Dialog open={customizeOpen} onOpenChange={setCustomizeOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("cookieBanner.preferencesTitle")}</DialogTitle>
          </DialogHeader>
          <ConsentSettings onSaved={() => setCustomizeOpen(false)} />
        </DialogContent>
      </Dialog>
    </>
  );
}
