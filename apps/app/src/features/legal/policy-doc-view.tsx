import type { PolicyType } from "@packages/policies";
import { Card, CardContent } from "@packages/ui/components/ui/card";
import { TypographyH1, TypographyMuted } from "@packages/ui/components/ui/typography";
import { POLICY_DOCS } from "./policies.config";

interface PolicyDocViewProps {
  type: PolicyType;
}

export function PolicyDocView({ type }: PolicyDocViewProps) {
  const { Body, title, version, effectiveDate } = POLICY_DOCS[type];
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6">
      <header className="flex flex-col gap-2">
        <TypographyH1 variant="page">{title}</TypographyH1>
        <TypographyMuted>
          Version {version} — effective {effectiveDate}
        </TypographyMuted>
      </header>

      <Card>
        <CardContent>
          <Body />
        </CardContent>
      </Card>
    </main>
  );
}
