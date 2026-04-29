import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@packages/ui/components/ui/card";
import {
  TypographyH2,
  TypographyMuted,
} from "@packages/ui/components/ui/typography";
import { Check, X } from "lucide-react";

const fits = [
  "You're shipping a B2B SaaS (multi-tenant) you'll maintain for 2+ years",
  "You want Stripe + auth + email wired — not to glue them yourself",
  "You refuse technical debt from day one",
  "You've touched DDD before and know when to skip it",
  "You code with an AI agent and want it to follow your rules",
];

const doesntFit = [
  "You're looking for a turnkey admin theme or dashboard",
  "You want a throwaway prototype in 24 hours",
  "You reject anything DDD-flavored, even when scoped to business logic",
  "You want Next.js / Remix / Nuxt — that's a different repo",
];

export function WhoItsFor() {
  return (
    <section id="for-who" className="space-y-6">
      <div className="space-y-2 text-center">
        <TypographyH2 className="border-0 pb-0">
          Who it's for — and who it isn't
        </TypographyH2>
        <TypographyMuted>
          An opinionated boilerplate qualifies its readers.
        </TypographyMuted>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="border-l-4 border-l-chart-1">
          <CardHeader>
            <CardTitle>For you if…</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {fits.map((item) => (
                <li
                  key={item}
                  className="flex items-start gap-2 text-muted-foreground text-sm"
                >
                  <Check className="mt-0.5 size-4 shrink-0 text-chart-1" />
                  {item}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-chart-3">
          <CardHeader>
            <CardTitle>Move along if…</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {doesntFit.map((item) => (
                <li
                  key={item}
                  className="flex items-start gap-2 text-muted-foreground text-sm"
                >
                  <X className="mt-0.5 size-4 shrink-0 text-chart-3" />
                  {item}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
