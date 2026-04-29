import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@packages/ui/components/ui/card";
import { Boxes, Database, Zap } from "lucide-react";

const stack = [
  {
    icon: Zap,
    title: "Bun runtime",
    description: "API Hono sur Bun.serve natif. Build prod ~7ms.",
  },
  {
    icon: Database,
    title: "Drizzle + Postgres",
    description: "ORM typé, migrations versionnées, port 5433.",
  },
  {
    icon: Boxes,
    title: "DDD-kit",
    description: "Result, Option, Aggregate, ValueObject, DomainEvent.",
  },
];

export function FeaturesGrid() {
  return (
    <section className="grid gap-6 md:grid-cols-3">
      {stack.map((item) => (
        <Card key={item.title}>
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
