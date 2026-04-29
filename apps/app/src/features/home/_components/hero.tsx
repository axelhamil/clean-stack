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
      <Badge variant="outline">Boilerplate · Clean Architecture + DDD</Badge>
      <TypographyH1 className="text-5xl md:text-6xl">
        Le monorepo qui pense
        <br />
        <span className="text-muted-foreground">avant de coder</span>
      </TypographyH1>
      <TypographyLead className="mx-auto max-w-2xl text-balance">
        Bun + Hono · Vite + React 19 · Drizzle + Postgres · DDD primitives.
        Aucune feature métier, juste les fondations — tu n'as plus qu'à coder le
        domaine.
      </TypographyLead>
      <div className="flex flex-wrap justify-center gap-3">
        <Button>
          Get started <ArrowRight className="size-4" />
        </Button>
        <Button variant="outline">
          <BookOpen className="size-4" />
          Documentation
        </Button>
      </div>
    </section>
  );
}
