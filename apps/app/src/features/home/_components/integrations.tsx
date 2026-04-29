import { Badge } from "@packages/ui/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@packages/ui/components/ui/card";
import {
  TypographyH2,
  TypographyInlineCode,
  TypographyMuted,
} from "@packages/ui/components/ui/typography";
import {
  Building2,
  CreditCard,
  HardDrive,
  Mail,
  ShieldCheck,
} from "lucide-react";

const integrations = [
  {
    icon: ShieldCheck,
    title: "BetterAuth",
    description:
      "Email/password, magic-link, passkeys, 2FA, DB-backed sessions. The first auth that runs natively on Bun + Hono — no hacks.",
    badges: ["passkeys", "2FA", "magic-link", "DB sessions"],
    snippet: "apps/api/src/adapters/auth/better-auth.ts",
  },
  {
    icon: Building2,
    title: "Multi-tenant from day one",
    description:
      "Organization plugin enabled, organizationId FK on every business table from the very first migration. Org switcher in the header. B2C? An invisible personal org is auto-created.",
    badges: ["organizations", "members", "invitations", "roles"],
    snippet: "packages/drizzle/src/schema/auth.ts",
  },
  {
    icon: CreditCard,
    title: "Stripe (BetterAuth plugin)",
    description:
      "Customer creation, subscriptions, customer portal, webhooks, DB sync — all wrapped. Stripe customer = per organization, not per user. No more glue to write.",
    badges: ["checkout", "portal", "webhooks", "trials"],
    snippet: "POST /api/auth/stripe/webhook",
  },
  {
    icon: Mail,
    title: "Resend",
    description:
      "Templates managed from the dashboard (no rebuild to change wording), built-in versioning, native A/B test. Bounces & complaints tracked via webhook.",
    badges: ["dashboard templates", "DKIM/SPF", "webhooks"],
    snippet: "apps/api/src/adapters/services/email.service.ts",
  },
  {
    icon: HardDrive,
    title: "R2 + MinIO",
    description:
      "Cloudflare R2 in production (zero egress fees), MinIO in dev (same S3 API, zero divergence). Presigned upload/download URLs — the API never proxies a file.",
    badges: ["S3-compatible", "presigned", "zero egress"],
    snippet: "POST /uploads/presign",
  },
  {
    icon: Building2,
    title: "Signed webhooks",
    description:
      "Every external webhook (Stripe, Resend) lives under a dedicated route with mandatory signature verification before any processing.",
    badges: ["Stripe", "Resend", "signature check"],
    snippet: "apps/api/src/routes/webhooks/",
  },
];

export function Integrations() {
  return (
    <section id="integrations" className="space-y-6">
      <div className="space-y-2 text-center">
        <TypographyH2 className="border-0 pb-0">
          SaaS integrations, already wired
        </TypographyH2>
        <TypographyMuted>
          None in DDD. All in{" "}
          <TypographyInlineCode>adapters/</TypographyInlineCode> /{" "}
          <TypographyInlineCode>routes/</TypographyInlineCode> — pragmatic,
          isolated, replaceable. The domain stays pure.
        </TypographyMuted>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {integrations.map((i) => (
          <Card key={i.title} className="hover:border-ring">
            <CardHeader>
              <i.icon className="size-5 text-muted-foreground" />
              <CardTitle>{i.title}</CardTitle>
              <CardDescription>{i.description}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-1.5">
                {i.badges.map((b) => (
                  <Badge key={b} variant="secondary" className="text-xs">
                    {b}
                  </Badge>
                ))}
              </div>
              <TypographyInlineCode className="block w-full text-xs">
                {i.snippet}
              </TypographyInlineCode>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
