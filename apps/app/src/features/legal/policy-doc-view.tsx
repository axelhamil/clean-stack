import { toLocale } from "@packages/i18n";
import type { PolicyType } from "@packages/policies";
import { Card, CardContent } from "@packages/ui/components/ui/card";
import { pageContainerVariants } from "@packages/ui/components/ui/page-container";
import { TypographyH1, TypographyMuted } from "@packages/ui/components/ui/typography";
import { cn } from "@packages/ui/libs/utils.js";
import { useTranslation } from "react-i18next";
import { POLICY_TITLE_KEYS } from "../../shared/legal/policy-labels";
import { UntranslatedBodyBanner } from "./components/untranslated-body-banner";
import { isEnglishFallback, policyBodyFor } from "./policies/bodies";
import { POLICY_DOCS } from "./policies.config";

interface PolicyDocViewProps {
  type: PolicyType;
}

export function PolicyDocView({ type }: PolicyDocViewProps) {
  const { t, i18n } = useTranslation("common");
  const locale = toLocale(i18n.language);
  const { version, effectiveDate } = POLICY_DOCS[type];
  const Body = policyBodyFor(locale, type);

  return (
    <main className={cn(pageContainerVariants({ width: "prose" }), "flex flex-col gap-6 py-6")}>
      <header className="flex flex-col gap-2">
        <TypographyH1 variant="page">{t(POLICY_TITLE_KEYS[type])}</TypographyH1>
        <TypographyMuted>
          {t("legal.policies.versionLine", { version, date: effectiveDate })}
        </TypographyMuted>
      </header>

      <UntranslatedBodyBanner show={isEnglishFallback(locale, type)} />

      <Card>
        <CardContent>
          <Body />
        </CardContent>
      </Card>
    </main>
  );
}
