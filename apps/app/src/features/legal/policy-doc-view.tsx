import { toLocale } from "@packages/i18n";
import type { PolicyType } from "@packages/policies";
import { pageContainerVariants } from "@packages/ui/components/ui/page-container";
import { PageHeader } from "@packages/ui/components/ui/page-header";
import { Separator } from "@packages/ui/components/ui/separator";
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
    <main className={cn(pageContainerVariants({ width: "prose" }), "flex flex-col gap-8 py-8")}>
      <PageHeader
        title={t(POLICY_TITLE_KEYS[type])}
        description={t("legal.policies.versionLine", { version, date: effectiveDate })}
      />

      <Separator />

      <UntranslatedBodyBanner show={isEnglishFallback(locale, type)} />

      <Body />
    </main>
  );
}
