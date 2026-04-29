import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@packages/ui/components/ui/card";
import {
  Boxes,
  CheckCircle2,
  Layers,
  Network,
  Scissors,
  Zap,
} from "lucide-react";

const items = [
  {
    icon: Zap,
    title: "Bun, where it shines",
    description:
      "API on native Bun.serve. Production build in ~7 ms, instant hot reload, zero tsx or node-server.",
  },
  {
    icon: Network,
    title: "Hono RPC, zero glue",
    description:
      "Routes accumulated by chaining, app consumes AppType. No client to write, no schema to duplicate.",
  },
  {
    icon: Boxes,
    title: "DDD-kit, just the essentials",
    description:
      "Result, Option, Aggregate, ValueObject, DomainEvent. Six primitives, not yet another framework.",
  },
  {
    icon: Scissors,
    title: "DDD scope, decided",
    description:
      "DDD for the business you actually charge for. Auth, billing, quotas stay in config + middleware. ~70% less code.",
  },
  {
    icon: Layers,
    title: "Unidirectional imports",
    description:
      "routes → features → adapters → common. No barrel, no cross-feature, no cycle. Documented and enforced by convention.",
  },
  {
    icon: CheckCircle2,
    title: "Zero-warning pipeline",
    description:
      "Biome, knip, jscpd, type-check, commitlint. One warning = one fix before push. Never --no-verify.",
  },
];

export function FeaturesGrid() {
  return (
    <section className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
      {items.map((item) => (
        <Card key={item.title} className="hover:border-ring">
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
