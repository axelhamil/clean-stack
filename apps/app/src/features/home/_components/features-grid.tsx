import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@packages/ui/components/ui/card";
import {
  Boxes,
  Database,
  Layers,
  Network,
  ShieldCheck,
  Zap,
} from "lucide-react";

const items = [
  {
    icon: Zap,
    title: "Bun runtime",
    description: "API Hono sur Bun.serve natif. Build prod ~7ms, hot reload.",
  },
  {
    icon: Network,
    title: "Hono RPC",
    description:
      "Routes typées end-to-end via hc<AppType>. Aucun client à coder.",
  },
  {
    icon: Database,
    title: "Drizzle + Postgres",
    description: "ORM typé, migrations versionnées, port 5433 dédié.",
  },
  {
    icon: Boxes,
    title: "DDD-kit",
    description: "Result, Option, Aggregate, ValueObject, DomainEvent.",
  },
  {
    icon: Layers,
    title: "Clean Architecture",
    description: "Domain isolé, use-cases, ports/adapters, DI inwire.",
  },
  {
    icon: ShieldCheck,
    title: "Strict by default",
    description: "TS strict, Zod, no throw, no null. Result partout.",
  },
];

export function FeaturesGrid() {
  return (
    <section className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
      {items.map((item) => (
        <Card key={item.title} className="transition-colors hover:border-ring">
          <CardHeader>
            <item.icon className="size-5 text-muted-foreground" />
            <CardTitle>{item.title}</CardTitle>
            <CardDescription>{item.description}</CardDescription>
          </CardHeader>
        </Card>
      ))}
    </section>
  );
}
