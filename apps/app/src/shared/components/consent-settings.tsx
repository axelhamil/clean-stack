import { OPTIONAL_CATEGORIES } from "@packages/cookie-consent";
import { Button } from "@packages/ui/components/ui/button";
import { Card, CardContent, CardHeader } from "@packages/ui/components/ui/card";
import { Label } from "@packages/ui/components/ui/label";
import { Switch } from "@packages/ui/components/ui/switch";
import { TypographyH2, TypographyMuted } from "@packages/ui/components/ui/typography";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { recordConsentMutationOptions } from "../api/mutations/record-consent";
import { withdrawConsentMutationOptions } from "../api/mutations/withdraw-consent";
import { consentQueryOptions } from "../api/queries/consent";

interface CategoryMeta {
  label: string;
  description: string;
}

const CATEGORY_META = {
  necessary: {
    label: "Strictly necessary",
    description: "Required for the service to function. Cannot be disabled.",
  },
  functional: {
    label: "Functional",
    description: "Enhance your experience (e.g. language or region preferences).",
  },
  analytics: {
    label: "Analytics",
    description: "Help us understand how visitors use the service (anonymised data).",
  },
  marketing: {
    label: "Marketing",
    description: "Allow personalised advertising and retargeting.",
  },
} satisfies Record<string, CategoryMeta>;

type OptionalKey = "functional" | "analytics" | "marketing";

const ALL_CATEGORIES = ["necessary", "functional", "analytics", "marketing"] as const;
type AllCategory = (typeof ALL_CATEGORIES)[number];

interface ConsentSettingsProps {
  onSaved?: () => void;
}

export function ConsentSettings({ onSaved }: ConsentSettingsProps) {
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
      toast.success("Preferences saved");
      onSaved?.();
    },
  });

  const withdraw = useMutation({
    ...withdrawConsentMutationOptions,
    onSuccess: async () => {
      await queryClient.refetchQueries({ queryKey: consentQueryOptions.queryKey });
      toast.success("Consent withdrawn");
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
        <TypographyH2>Manage your cookie preferences</TypographyH2>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <div className="flex flex-col gap-4">
          {ALL_CATEGORIES.map((cat: AllCategory) => {
            const meta = CATEGORY_META[cat];
            const isNecessary = cat === "necessary";
            const checked = isNecessary || enabled[cat as OptionalKey];
            return (
              <div key={cat} className="flex items-start justify-between gap-4">
                <div className="flex flex-col gap-1">
                  <Label htmlFor={`consent-${cat}`}>{meta.label}</Label>
                  <TypographyMuted>{meta.description}</TypographyMuted>
                </div>
                <Switch
                  id={`consent-${cat}`}
                  checked={checked}
                  onCheckedChange={(val) => {
                    if (!isNecessary) setEnabled((prev) => ({ ...prev, [cat]: val }));
                  }}
                  disabled={isNecessary || isPending}
                  aria-label={meta.label}
                />
              </div>
            );
          })}
        </div>
        <div className="flex gap-2">
          <Button onClick={handleSave} disabled={isPending}>
            Save preferences
          </Button>
          <Button variant="outline" onClick={handleWithdraw} disabled={isPending}>
            Withdraw all consent
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
