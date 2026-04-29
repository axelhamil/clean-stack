import { Badge } from "@packages/ui/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@packages/ui/components/ui/card";
import {
  TypographyH2,
  TypographyMuted,
  TypographyP,
} from "@packages/ui/components/ui/typography";
import { Hammer, LineChart, Rocket } from "lucide-react";

const loop = [
  {
    icon: Hammer,
    title: "Build",
    intro: "Ship the MVP, not the plumbing.",
    detail:
      "Auth, billing, multi-tenant, email, storage — already wired. Day one ships the feature that tests your hypothesis, not six weeks of foundation work.",
  },
  {
    icon: LineChart,
    title: "Measure",
    intro: "Real customers from week one.",
    detail:
      "Stripe checkout, signed webhooks, multi-tenant from the very first migration. You charge in dollars, not in vanity metrics. Real signal beats opinions.",
  },
  {
    icon: Rocket,
    title: "Learn",
    intro: "Pivot without trashing the stack.",
    detail:
      "Clean Architecture isolates your domain from the SaaS plumbing. When a hypothesis breaks, you replace use cases — not auth, not email, not DI. Pivots stay cheap.",
  },
];

export function LeanPhilosophy() {
  return (
    <section id="lean" className="space-y-6">
      <div className="space-y-2 text-center">
        <Badge variant="outline" className="mx-auto">
          Lean Startup, applied
        </Badge>
        <TypographyH2 className="border-0 pb-0">
          Build · Measure · Learn — without rebuilding the foundation
        </TypographyH2>
        <TypographyMuted className="mx-auto max-w-2xl text-balance">
          Eric Ries' loop assumes you ship something testable fast. Clean-stack
          collapses the "build" phase to the only part that matters: your
          domain. Everything else — the SaaS plumbing — is already done.
        </TypographyMuted>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {loop.map(({ icon: Icon, title, intro, detail }) => (
          <Card key={title}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Icon className="size-4 text-muted-foreground" />
                {title}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <TypographyP className="font-medium">{intro}</TypographyP>
              <TypographyMuted className="text-sm">{detail}</TypographyMuted>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
