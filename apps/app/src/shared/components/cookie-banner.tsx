import { COOKIE_CONSENT_VERSION, OPTIONAL_CATEGORIES } from "@packages/cookie-consent";
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
import { recordConsentMutationOptions } from "../api/mutations/record-consent";
import { consentQueryOptions } from "../api/queries/consent";
import { ConsentSettings } from "./consent-settings";

export function CookieBanner() {
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
        aria-label="Cookie consent"
        aria-modal="false"
        className="fixed bottom-0 left-0 right-0 z-50 border-t bg-background shadow-lg"
      >
        <div className="mx-auto flex max-w-5xl flex-col gap-4 p-4 md:flex-row md:items-center md:justify-between md:p-6">
          <TypographyMuted className="flex-1">
            We use cookies to operate this service. Optional cookies help improve your experience.{" "}
            <TextLink href="/legal/cookies">Cookie policy</TextLink>.
          </TypographyMuted>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={handleRejectAll} disabled={record.isPending}>
              Reject all
            </Button>
            <Button variant="outline" onClick={() => setCustomizeOpen(true)}>
              Customize
            </Button>
            <Button variant="outline" onClick={handleAcceptAll} disabled={record.isPending}>
              Accept all
            </Button>
          </div>
        </div>
      </div>
      <Dialog open={customizeOpen} onOpenChange={setCustomizeOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Cookie preferences</DialogTitle>
          </DialogHeader>
          <ConsentSettings onSaved={() => setCustomizeOpen(false)} />
        </DialogContent>
      </Dialog>
    </>
  );
}
