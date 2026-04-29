import { Badge } from "@packages/ui/components/ui/badge";
import { Card, CardContent } from "@packages/ui/components/ui/card";
import {
  TypographyH2,
  TypographyInlineCode,
  TypographyMuted,
  TypographyP,
} from "@packages/ui/components/ui/typography";
import {
  ArrowDown,
  Database,
  FileCode,
  Globe,
  Layers,
  Mail,
  MousePointerClick,
  Package,
  Send,
  Shield,
  Zap,
} from "lucide-react";

type Step = {
  side: "app" | "wire" | "api";
  icon: typeof MousePointerClick;
  title: string;
  detail: string;
  file?: string;
};

const steps: Step[] = [
  {
    side: "app",
    icon: MousePointerClick,
    title: "Form submit",
    detail:
      "RHF + zodResolver + shadcn Form. Client-side validation, defaultValues, FormMessage per field.",
    file: "features/home/_forms/newsletter-form.tsx",
  },
  {
    side: "app",
    icon: Zap,
    title: "Feature hook",
    detail:
      "useNewsletterSubscribe: useMutation, sonner toast on success, TanStack Query cache invalidation.",
    file: "features/home/_hooks/use-newsletter-subscribe.ts",
  },
  {
    side: "app",
    icon: Globe,
    title: "API client adapter",
    detail:
      "api.newsletter.subscribe.$post({ json }). Hono RPC: end-to-end types, no client to write.",
    file: "adapters/api-client.ts",
  },
  {
    side: "wire",
    icon: Send,
    title: "Hono RPC — app ↔ api boundary",
    detail:
      "AppType shared via type-only import. Zero cross-bundle runtime, just a TypeScript contract.",
  },
  {
    side: "api",
    icon: Shield,
    title: "Hono middleware",
    detail:
      "secureHeaders, CORS, requestId, logger, zValidator. BetterAuth hydrates c.var.user and c.var.orgId.",
    file: "apps/api/src/index.ts + adapters/middleware/",
  },
  {
    side: "api",
    icon: FileCode,
    title: "Controller (route)",
    detail:
      "Pulls the use case from the inwire container, opens a transaction, passes the validated input.",
    file: "routes/newsletter.ts",
  },
  {
    side: "api",
    icon: Layers,
    title: "Use case",
    detail:
      "SubscribeNewsletter: builds the Subscriber aggregate, persists it via the IRepository port, returns Result<T, E>.",
    file: "application/use-cases/subscribe-newsletter.ts",
  },
  {
    side: "api",
    icon: Package,
    title: "Aggregate + Domain Event",
    detail:
      "Subscriber.create() applies invariants and adds SubscriberCreatedEvent. No throw, no null.",
    file: "domain/subscriber.ts",
  },
  {
    side: "api",
    icon: Database,
    title: "Drizzle repository",
    detail:
      "Maps domain → row, INSERT inside the transaction. organizationId scoped automatically.",
    file: "adapters/repositories/subscriber.repository.ts",
  },
  {
    side: "api",
    icon: Mail,
    title: "Post-commit event handler",
    detail:
      "EventDispatcher fires SendWelcomeEmailHandler → Resend.sendTemplate(WELCOME, …). Outside the transaction.",
    file: "application/event-handlers/send-welcome-email.ts",
  },
];

const sideMeta = {
  app: {
    label: "apps/app",
    color: "border-l-chart-2",
    badge: "App · React",
  },
  api: {
    label: "apps/api",
    color: "border-l-chart-3",
    badge: "API · Hono",
  },
  wire: {
    label: "wire",
    color: "border-l-chart-1",
    badge: "Hono RPC",
  },
} as const;

export function ArchitectureFlow() {
  return (
    <section id="architecture" className="space-y-8">
      <div className="space-y-2 text-center">
        <TypographyH2 className="border-0 pb-0">
          Anatomy of a request, from click to DB commit
        </TypographyH2>
        <TypographyMuted className="mx-auto max-w-2xl text-balance">
          A single mutation crosses ten layers, two apps, zero glue. Each step
          owns one responsibility — and one file. That's architecture: not a
          folder list, a path you can read.
        </TypographyMuted>
      </div>

      <div className="mx-auto max-w-3xl space-y-3">
        {steps.map((step, idx) => {
          const meta = sideMeta[step.side];
          const Icon = step.icon;
          const isWire = step.side === "wire";
          return (
            <Card
              key={step.title}
              className={`border-l-4 ${meta.color} ${isWire ? "bg-muted/40" : ""}`}
            >
              <CardContent className="flex gap-4">
                <div className="flex flex-col items-center gap-2">
                  <Badge variant="secondary" className="size-8 font-mono">
                    {String(idx + 1).padStart(2, "0")}
                  </Badge>
                  <Icon className="size-4 text-muted-foreground" />
                </div>
                <div className="flex-1 space-y-1.5">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <TypographyP className="font-medium">
                      {step.title}
                    </TypographyP>
                    <Badge variant="outline" className="text-[10px]">
                      {meta.badge}
                    </Badge>
                  </div>
                  <TypographyMuted className="text-sm leading-snug">
                    {step.detail}
                  </TypographyMuted>
                  {step.file && (
                    <TypographyInlineCode className="text-xs">
                      {step.file}
                    </TypographyInlineCode>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card className="mx-auto max-w-3xl bg-muted/30">
        <CardContent className="flex items-center gap-3">
          <ArrowDown className="size-4 shrink-0 text-muted-foreground" />
          <TypographyMuted className="text-xs">
            Domain isolated: zero external imports (zod + ddd-kit only). Use
            cases instantiate nothing — everything comes from DI. Events
            post-commit, never inside the aggregate. On the app, hooks never
            touch <code>fetch</code> — always <code>api.*</code>.
          </TypographyMuted>
        </CardContent>
      </Card>
    </section>
  );
}
