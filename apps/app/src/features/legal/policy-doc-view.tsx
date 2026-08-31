import { toLocale } from "@packages/i18n";
import type { PolicyType } from "@packages/policies";
import { Alert, AlertDescription } from "@packages/ui/components/ui/alert";
import { Card, CardContent } from "@packages/ui/components/ui/card";
import { TypographyH1, TypographyMuted } from "@packages/ui/components/ui/typography";
import { Languages } from "lucide-react";
import { useTranslation } from "react-i18next";
import { isEnglishFallback, policyBodyFor } from "./policies";
import { POLICY_DOCS } from "./policies.config";
import { POLICY_TITLE_KEYS } from "./policy-labels";

interface PolicyDocViewProps {
  type: PolicyType;
}

export function PolicyDocView({ type }: PolicyDocViewProps) {
  const { t, i18n } = useTranslation("common");
  const locale = toLocale(i18n.language);
  const { version, effectiveDate } = POLICY_DOCS[type];
  const Body = policyBodyFor(locale, type);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6">
      <header className="flex flex-col gap-2">
        <TypographyH1 variant="page">{t(POLICY_TITLE_KEYS[type])}</TypographyH1>
        <TypographyMuted>
          {t("legal.policies.versionLine", { version, date: effectiveDate })}
        </TypographyMuted>
      </header>

      {isEnglishFallback(locale, type) ? (
        <Alert>
          <Languages />
          <AlertDescription>{t("legal.policies.unavailableBanner")}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardContent>
          <Body />
        </CardContent>
      </Card>
    </main>
  );
}
