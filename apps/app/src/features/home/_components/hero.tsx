import { Badge } from "@packages/ui/components/ui/badge";
import { Button } from "@packages/ui/components/ui/button";
import { ArrowRight } from "lucide-react";

export function Hero() {
  return (
    <section className="space-y-6 text-center">
      <Badge variant="outline">Boilerplate</Badge>
      <h1 className="text-balance font-bold text-5xl tracking-tight">
        Clean Architecture monorepo
      </h1>
      <p className="mx-auto max-w-2xl text-balance text-lg text-muted-foreground">
        Bun + Hono · Vite + React 19 · Drizzle + Postgres · DDD primitives.
        Aucune feature métier, juste les fondations.
      </p>
      <div className="flex justify-center gap-3">
        <Button>
          Get started <ArrowRight className="size-4" />
        </Button>
        <Button variant="outline">Documentation</Button>
      </div>
    </section>
  );
}
