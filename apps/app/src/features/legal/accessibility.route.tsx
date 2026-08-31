import { toLocale } from "@packages/i18n";
import { Card, CardContent, CardHeader } from "@packages/ui/components/ui/card";
import { TextLink } from "@packages/ui/components/ui/text-link";
import {
  TypographyH1,
  TypographyH2,
  TypographyList,
  TypographyMuted,
  TypographyP,
} from "@packages/ui/components/ui/typography";
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
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6">
      <header className="flex flex-col gap-2">
        <TypographyH1>{t("legal.accessibility.title")}</TypographyH1>
        <TypographyMuted>{t("legal.accessibility.subtitle")}</TypographyMuted>
      </header>

      <UntranslatedBodyBanner show={locale !== "en"} />

      <Card>
        <CardHeader>
          <TypographyH2>Compliance status</TypographyH2>
        </CardHeader>
        <CardContent>
          <TypographyP className="my-0">
            This application aims to partially conform to WCAG 2.1 Level AA per EN 301 549 v3.2.1.
            Partial compliance means some parts do not fully conform yet (see Known limitations).
          </TypographyP>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <TypographyH2>Known limitations</TypographyH2>
        </CardHeader>
        <CardContent>
          <TypographyList className="my-0">
            <li>Keyboard navigation of modal dialogs may be incomplete in some flows</li>
            <li>Color contrast of muted text may not meet 4.5:1 in all themes</li>
            <li>Automated audit via Lighthouse CI pending (Phase A.6)</li>
          </TypographyList>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <TypographyH2>Technical specifications</TypographyH2>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <TypographyP className="my-0">
            This application relies on the following technologies: HTML5, CSS (Tailwind 4), ARIA,
            and React 19.
          </TypographyP>
          <TypographyP className="my-0">
            Compatibility has been tested with the following browser and assistive technology
            combinations: Chrome with NVDA, Firefox with NVDA, and Safari with VoiceOver.
          </TypographyP>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <TypographyH2>Feedback and contact information</TypographyH2>
        </CardHeader>
        <CardContent>
          <TypographyP className="my-0">
            If you experience an accessibility barrier, email{" "}
            <TextLink href="mailto:accessibility@[domain]">accessibility@[domain]</TextLink>. We aim
            to respond within 15 business days.
          </TypographyP>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <TypographyH2>Enforcement and escalation</TypographyH2>
        </CardHeader>
        <CardContent>
          <TypographyP className="my-0">
            If our response is unsatisfactory, contact the national digital accessibility authority
            in your country (e.g. ARCOM in France). [Replace with the authority for your
            jurisdiction.]
          </TypographyP>
        </CardContent>
      </Card>
    </main>
  );
}
