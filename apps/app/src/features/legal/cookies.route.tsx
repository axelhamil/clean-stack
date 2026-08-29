import { CONSENT_CATEGORIES, type ConsentCategory } from "@packages/cookie-consent";
import { Card, CardContent, CardHeader } from "@packages/ui/components/ui/card";
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
import { createFileRoute } from "@tanstack/react-router";
import { ConsentSettings } from "../../shared/components/consent-settings";
import type { CookieInfo } from "./cookies.config";
import { COOKIE_INVENTORY } from "./cookies.config";

export const Route = createFileRoute("/legal/cookies")({
  component: CookiesPage,
});

const CATEGORY_LABELS: Record<ConsentCategory, string> = {
  necessary: "Strictly necessary",
  functional: "Functional",
  analytics: "Analytics",
  marketing: "Marketing",
};

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
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6">
      <header className="flex flex-col gap-2">
        <TypographyH1>Cookie policy</TypographyH1>
        <TypographyMuted>CNIL compliant — Last updated: 2026-07-09</TypographyMuted>
      </header>

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
              <TypographyH2>{CATEGORY_LABELS[cat]}</TypographyH2>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <CookieTable
                  cookies={cookies}
                  caption={`${CATEGORY_LABELS[cat]} cookies used by this application`}
                />
              </div>
            </CardContent>
          </Card>
        );
      })}
    </main>
  );
}
