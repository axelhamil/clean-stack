import { CONSENT_CATEGORIES, type ConsentCategory } from "@packages/cookie-consent";
import { toLocale } from "@packages/i18n";
import { Card, CardContent, CardHeader } from "@packages/ui/components/ui/card";
import { pageContainerVariants } from "@packages/ui/components/ui/page-container";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@packages/ui/components/ui/table";
import {
  TypographyH1,
  TypographyH2,
  TypographyMuted,
  TypographyP,
} from "@packages/ui/components/ui/typography";
import { cn } from "@packages/ui/libs/utils.js";
import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { ConsentSettings } from "../../shared/components/consent-settings";
import { UntranslatedBodyBanner } from "./components/untranslated-body-banner";
import { CATEGORY_LABEL_KEYS } from "./cookie-category-labels";
import type { CookieInfo } from "./cookies.config";
import { COOKIE_INVENTORY } from "./cookies.config";

export const Route = createFileRoute("/legal/cookies")({
  component: CookiesPage,
});

interface CookieTableProps {
  cookies: readonly CookieInfo[];
  caption: string;
}

function CookieTable({ cookies, caption }: CookieTableProps) {
  return (
    <Table>
      <TableCaption>{caption}</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Provider</TableHead>
          <TableHead>Purpose</TableHead>
          <TableHead>Retention</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {cookies.map((cookie) => (
          <TableRow key={cookie.name}>
            <TableCell className="font-mono text-xs">{cookie.name}</TableCell>
            <TableCell>{cookie.provider}</TableCell>
            <TableCell className="whitespace-normal">{cookie.purpose}</TableCell>
            <TableCell>{cookie.retention}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function CookiesPage() {
  const { t, i18n } = useTranslation("common");
  const locale = toLocale(i18n.language);
  return (
    <main className={cn(pageContainerVariants({ width: "prose" }), "flex flex-col gap-6 py-6")}>
      <header className="flex flex-col gap-2">
        <TypographyH1>{t("legal.cookies.title")}</TypographyH1>
        <TypographyMuted>{t("legal.cookies.subtitle")}</TypographyMuted>
      </header>

      <UntranslatedBodyBanner show={locale !== "en"} />

      <Card>
        <CardHeader>
          <TypographyH2>What are cookies?</TypographyH2>
        </CardHeader>
        <CardContent>
          <TypographyP className="my-0">
            Cookies are small text files placed on your device by your browser when you visit a
            website. They allow us to remember your preferences and measure how the service is used.
            You can control which optional cookies are active using the preferences panel below.
          </TypographyP>
        </CardContent>
      </Card>

      <ConsentSettings />

      {CONSENT_CATEGORIES.map((cat: ConsentCategory) => {
        const cookies = COOKIE_INVENTORY[cat];
        return (
          <Card key={cat}>
            <CardHeader>
              <TypographyH2>{t(CATEGORY_LABEL_KEYS[cat])}</TypographyH2>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <CookieTable
                  cookies={cookies}
                  caption={t("legal.cookies.tableCaption", {
                    category: t(CATEGORY_LABEL_KEYS[cat]),
                  })}
                />
              </div>
            </CardContent>
          </Card>
        );
      })}
    </main>
  );
}
