import { toLocale } from "@packages/i18n";
import { pageContainerVariants } from "@packages/ui/components/ui/page-container";
import { PageHeader } from "@packages/ui/components/ui/page-header";
import { Separator } from "@packages/ui/components/ui/separator";
import { TextLink } from "@packages/ui/components/ui/text-link";
import { TypographyH2, TypographyList, TypographyP } from "@packages/ui/components/ui/typography";
import { cn } from "@packages/ui/libs/utils.js";
import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { UntranslatedBodyBanner } from "./components/untranslated-body-banner";

export const Route = createFileRoute("/legal/accessibility")({
  component: AccessibilityPage,
});

function AccessibilityPage() {
  const { t, i18n } = useTranslation("common");
  const locale = toLocale(i18n.language);
  return (
    <main className={cn(pageContainerVariants({ width: "prose" }), "flex flex-col gap-8 py-8")}>
      <PageHeader
        title={t("legal.accessibility.title")}
        description={t("legal.accessibility.subtitle")}
      />

      <Separator />

      <UntranslatedBodyBanner show={locale !== "en"} />

      <section className="flex flex-col gap-3">
        <TypographyH2>Compliance status</TypographyH2>
        <TypographyP>
          This application aims to partially conform to WCAG 2.1 Level AA per EN 301 549 v3.2.1.
          Partial compliance means some parts do not fully conform yet (see Known limitations).
        </TypographyP>
      </section>

      <section className="flex flex-col gap-3">
        <TypographyH2>Known limitations</TypographyH2>
        <TypographyList>
          <li>Keyboard navigation of modal dialogs may be incomplete in some flows</li>
          <li>Color contrast of muted text may not meet 4.5:1 in all themes</li>
          <li>Automated audit via Lighthouse CI pending (Phase A.6)</li>
        </TypographyList>
      </section>

      <section className="flex flex-col gap-3">
        <TypographyH2>Technical specifications</TypographyH2>
        <TypographyP>
          This application relies on the following technologies: HTML5, CSS (Tailwind 4), ARIA, and
          React 19.
        </TypographyP>
        <TypographyP>
          Compatibility has been tested with the following browser and assistive technology
          combinations: Chrome with NVDA, Firefox with NVDA, and Safari with VoiceOver.
        </TypographyP>
      </section>

      <section className="flex flex-col gap-3">
        <TypographyH2>Feedback and contact information</TypographyH2>
        <TypographyP>
          If you experience an accessibility barrier, email{" "}
          <TextLink href="mailto:accessibility@[domain]">accessibility@[domain]</TextLink>. We aim
          to respond within 15 business days.
        </TypographyP>
      </section>

      <section className="flex flex-col gap-3">
        <TypographyH2>Enforcement and escalation</TypographyH2>
        <TypographyP>
          If our response is unsatisfactory, contact the national digital accessibility authority in
          your country (e.g. ARCOM in France). [Replace with the authority for your jurisdiction.]
        </TypographyP>
      </section>
    </main>
  );
}
