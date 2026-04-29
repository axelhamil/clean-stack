import { Card } from "@packages/ui/components/ui/card";
import {
  TypographyH2,
  TypographyInlineCode,
  TypographyMuted,
} from "@packages/ui/components/ui/typography";
import { ArrowRight } from "lucide-react";

const layers = [
  {
    name: "routes/",
    role: "TanStack Router file-based",
    accent: "border-l-chart-1",
  },
  {
    name: "features/",
    role: "Workflows UI (≈ use-cases)",
    accent: "border-l-chart-2",
  },
  {
    name: "adapters/",
    role: "API client, query client, storage",
    accent: "border-l-chart-3",
  },
  {
    name: "common/",
    role: "Infra zéro-business",
    accent: "border-l-chart-4",
  },
];

export function ArchitectureFlow() {
  return (
    <section id="architecture" className="space-y-6">
      <div className="space-y-2 text-center">
        <TypographyH2 className="border-0 pb-0">
          Direction d'import stricte
        </TypographyH2>
        <TypographyMuted>
          Pas de cycle, pas de barrel, pas de cross-feature.
        </TypographyMuted>
      </div>
      <div className="flex flex-col items-stretch gap-3 lg:flex-row lg:items-center lg:justify-center">
        {layers.map((layer, idx) => (
          <div
            key={layer.name}
            className="flex flex-col items-center gap-3 lg:flex-row"
          >
            <Card
              className={`w-full border-l-4 px-5 py-4 lg:w-48 ${layer.accent}`}
            >
              <TypographyInlineCode className="bg-transparent px-0 py-0">
                {layer.name}
              </TypographyInlineCode>
              <TypographyMuted className="text-xs">
                {layer.role}
              </TypographyMuted>
            </Card>
            {idx < layers.length - 1 && (
              <ArrowRight className="size-5 shrink-0 rotate-90 text-muted-foreground lg:rotate-0" />
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
