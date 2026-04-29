import { Badge } from "@packages/ui/components/ui/badge";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@packages/ui/components/ui/tabs";
import {
  TypographyH2,
  TypographyMuted,
} from "@packages/ui/components/ui/typography";

const stack = {
  frontend: [
    "Vite 8",
    "React 19",
    "TanStack Router",
    "TanStack Query",
    "Tailwind 4",
    "shadcn/ui",
    "react-hook-form",
    "zod",
    "next-themes",
    "sonner",
  ],
  backend: [
    "Bun 1.3+",
    "Hono",
    "Drizzle ORM",
    "Postgres 17",
    "inwire (DI)",
    "ddd-kit",
    "zod",
  ],
  tooling: [
    "pnpm 10",
    "Turborepo",
    "Biome",
    "Husky",
    "commitlint",
    "semantic-release",
    "knip",
    "jscpd",
    "tsup",
    "vitest",
    "bun test",
  ],
};

export function StackTabs() {
  return (
    <section id="stack" className="space-y-6">
      <div className="space-y-2 text-center">
        <TypographyH2 className="border-0 pb-0">
          Stack wired, not pre-chewed
        </TypographyH2>
        <TypographyMuted>
          Thirty-five libraries — picked, wired, tested together. None of them
          got there by default.
        </TypographyMuted>
      </div>
      <Tabs defaultValue="frontend" className="mx-auto max-w-3xl">
        <TabsList className="mx-auto">
          <TabsTrigger value="frontend">Frontend</TabsTrigger>
          <TabsTrigger value="backend">Backend</TabsTrigger>
          <TabsTrigger value="tooling">Tooling</TabsTrigger>
        </TabsList>
        {(Object.keys(stack) as (keyof typeof stack)[]).map((key) => (
          <TabsContent key={key} value={key} className="mt-6">
            <div className="flex flex-wrap justify-center gap-2">
              {stack[key].map((tech) => (
                <Badge key={tech} variant="secondary">
                  {tech}
                </Badge>
              ))}
            </div>
          </TabsContent>
        ))}
      </Tabs>
    </section>
  );
}
