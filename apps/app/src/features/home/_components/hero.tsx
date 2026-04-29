import { Badge } from "@packages/ui/components/ui/badge";
import { Button } from "@packages/ui/components/ui/button";
import {
  TypographyH1,
  TypographyLead,
} from "@packages/ui/components/ui/typography";
import { ArrowRight, BookOpen } from "lucide-react";

export function Hero() {
  return (
    <section className="space-y-6 text-center">
      <Badge variant="outline" className="animate-fade-up">
        <span className="live-dot mr-1" aria-hidden />
        SaaS-ready · Auth + Billing + Multi-tenant + Storage already wired
      </Badge>
      <TypographyH1 className="animate-fade-up-delay-1 text-5xl md:text-6xl">
        The boilerplate
        <br />
        <span className="text-muted-foreground">that says no.</span>
      </TypographyH1>
      <TypographyLead className="mx-auto max-w-2xl animate-fade-up-delay-2 text-balance">
        BetterAuth, Stripe, Resend, R2 — already wired, already tested, signed
        webhooks. Multi-tenant from the very first migration. Fourteen
        non-negotiable architecture rules. You clone, you write business logic.
        Everything else is settled.
      </TypographyLead>
      <div className="flex animate-fade-up-delay-3 flex-wrap justify-center gap-3">
        <Button className="hover-arrow" asChild>
          <a
            href="https://github.com/axelhamil/clean-stack"
            target="_blank"
            rel="noreferrer"
          >
            Clone the repo <ArrowRight className="hover-arrow__icon size-4" />
          </a>
        </Button>
        <Button variant="outline" asChild>
          <a href="#architecture">
            <BookOpen className="size-4" />
            Read the architecture
          </a>
        </Button>
      </div>
    </section>
  );
}
