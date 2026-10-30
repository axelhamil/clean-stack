import { CONSENT_CATEGORIES } from "@packages/cookie-consent";
import { toLocale } from "@packages/i18n";
import { pageContainerVariants } from "@packages/ui/components/ui/page-container";
import { PageHeader } from "@packages/ui/components/ui/page-header";
import { Separator } from "@packages/ui/components/ui/separator";
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
  TypographyH2,
  TypographyInlineCode,
  TypographyP,
} from "@packages/ui/components/ui/typography";
import { cn } from "@packages/ui/libs/utils.js";
import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { ConsentSettings } from "../../shared/components/consent-settings";
import { UntranslatedBodyBanner } from "./components/untranslated-body-banner";
import { CATEGORY_LABEL_KEYS } from "./cookie-category-labels";
import { COOKIE_INVENTORY, type CookieInfo } from "./cookies.config";

export const Route = createFileRoute("/legal/cookies")({
  component: CookiesPage,
});

interface CookieTableProps {
  cookies: readonly CookieInfo[];
  caption: string;
}

function CookieTable({ cookies, caption }: CookieTableProps) {
  const { t } = useTranslation("common");

  return (
    <Table>
      <TableCaption>{caption}</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead>{t("legal.cookies.table.name")}</TableHead>
          <TableHead>{t("legal.cookies.table.provider")}</TableHead>
          <TableHead>{t("legal.cookies.table.purpose")}</TableHead>
          <TableHead>{t("legal.cookies.table.retention")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {cookies.map((cookie) => (
          <TableRow key={cookie.name}>
            <TableCell>
              <TypographyInlineCode>{cookie.name}</TypographyInlineCode>
            </TableCell>
            <TableCell>{cookie.provider}</TableCell>
            <TableCell className="min-w-56 whitespace-normal">{cookie.purpose}</TableCell>
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
    <main className={cn(pageContainerVariants({ width: "prose" }), "flex flex-col gap-8 py-8")}>
      <PageHeader title={t("legal.cookies.title")} description={t("legal.cookies.subtitle")} />

      <Separator />

      <UntranslatedBodyBanner show={locale !== "en"} />

      <section className="flex flex-col gap-3">
        <TypographyH2>What are cookies?</TypographyH2>
        <TypographyP>
          Cookies are small text files placed on your device by your browser when you visit a
          website. They allow us to remember your preferences and measure how the service is used.
          You can control which optional cookies are active using the preferences panel below.
        </TypographyP>
      </section>

      <ConsentSettings />

      {CONSENT_CATEGORIES.map((cat) => {
        const category = t(CATEGORY_LABEL_KEYS[cat]);

        return (
          <section key={cat} className="flex flex-col gap-3">
            <TypographyH2>{category}</TypographyH2>
            <CookieTable
              cookies={COOKIE_INVENTORY[cat]}
              caption={t("legal.cookies.tableCaption", { category })}
            />
          </section>
        );
      })}
    </main>
  );
}
