import { Card, CardContent } from "@packages/ui/components/ui/card";
import {
  TypographyH2,
  TypographyMuted,
  TypographyP,
} from "@packages/ui/components/ui/typography";
import { Check, Minus } from "lucide-react";

const shipped = [
  "Full auth: email/pwd, magic-link, passkeys, 2FA (BetterAuth)",
  "Multi-tenant from day one: organizations, members, invitations, switcher",
  "Stripe billing: checkout, customer portal, webhooks, automatic DB sync",
  "Transactional email: Resend + dashboard templates, bounce tracking",
  "S3-compatible storage: R2 in prod + MinIO in dev, presigned URLs",
  "i18n ready: TanStack Router locale-aware routes, type-safe message keys",
  "Hono API: requestId, CORS, secure-headers, logger, error handler",
  "Hono RPC end-to-end (AppType shared between api and app, no client to write)",
  "DDD-kit: Result, Option, Aggregate, Entity, ValueObject, DomainEvent",
  "Drizzle + Postgres 17 + TransactionService, auth schemas pre-generated",
  "Inwire DI: container + module slots per bounded context",
  "App: Vite 8, React 19, TanStack Router/Query, Tailwind 4, full shadcn",
  "Form contract: RHF + zodResolver + shadcn Form + sonner",
  "Dark/light theme with View Transitions API",
  "Pipeline: Husky, Biome, commitlint, semantic-release, knip, jscpd",
];

const notShipped = [
  {
    item: "Your business domain",
    why: "No aggregates, no tables, no product pages. That's exactly what you're here to write.",
  },
  {
    item: "Background queues / jobs",
    why: "BullMQ, Trigger.dev, Inngest — wire the IJobQueue port when you actually need it.",
  },
  {
    item: "Advanced search",
    why: "Postgres full-text covers 90% of cases. Meilisearch / Typesense as an adapter when you don't.",
  },
  {
    item: "Product analytics",
    why: "PostHog, Plausible, Umami — a script on the app side, not a backend dependency.",
  },
  {
    item: "Pre-built business UI",
    why: "No custom users table, no generic dashboard. The business logic stays yours.",
  },
];

export function InTheBox() {
  return (
    <section id="in-the-box" className="space-y-6">
      <div className="space-y-2 text-center">
        <TypographyH2 className="border-0 pb-0">
          What's in the box — and what isn't
        </TypographyH2>
        <TypographyMuted>
          Most SaaS boilerplates ship a half-baked auth you'll rip out anyway.
          We assume the opposite: a clean foundation, integrations under your
          control.
        </TypographyMuted>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardContent className="space-y-4 pt-6">
            <TypographyP className="font-medium">
              <Check className="mr-2 inline size-4 text-chart-1" />
              In the box
            </TypographyP>
            <ul className="space-y-2">
              {shipped.map((s) => (
                <li
                  key={s}
                  className="flex items-start gap-2 text-muted-foreground text-sm"
                >
                  <Check className="mt-0.5 size-4 shrink-0 text-chart-1" />
                  <span>{s}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-4 pt-6">
            <TypographyP className="font-medium">
              <Minus className="mr-2 inline size-4 text-muted-foreground" />
              Not in the box (by design)
            </TypographyP>
            <ul className="space-y-3">
              {notShipped.map((n) => (
                <li key={n.item} className="space-y-1">
                  <div className="flex items-center gap-2 text-sm">
                    <Minus className="size-3.5 shrink-0 text-muted-foreground" />
                    <span className="font-medium">{n.item}</span>
                  </div>
                  <TypographyMuted className="ml-5 text-xs">
                    {n.why}
                  </TypographyMuted>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
