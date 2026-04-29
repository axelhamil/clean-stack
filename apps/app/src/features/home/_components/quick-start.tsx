import { Card, CardContent } from "@packages/ui/components/ui/card";
import {
  TypographyH2,
  TypographyMuted,
} from "@packages/ui/components/ui/typography";
import { Terminal } from "lucide-react";

const steps = [
  { cmd: "git clone …/clean-stack && cd clean-stack", note: "Clone the repo" },
  { cmd: "pnpm install", note: "Workspaces + Turborepo ready" },
  { cmd: "docker compose up -d", note: "Postgres 17 on port 5433 + MinIO" },
  { cmd: "pnpm db:push && pnpm dev", note: "API + App running in Turbo TUI" },
];

export function QuickStart() {
  return (
    <section id="quick-start" className="space-y-6">
      <div className="space-y-2 text-center">
        <TypographyH2 className="border-0 pb-0">
          From clone to dev in four commands
        </TypographyH2>
        <TypographyMuted>
          No <em>"see the README for the next step"</em> moments.
        </TypographyMuted>
      </div>
      <Card className="mx-auto max-w-2xl">
        <CardContent className="pt-6">
          <ol className="space-y-3">
            {steps.map((s, i) => (
              <li key={s.cmd} className="flex items-start gap-3">
                <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-secondary font-mono text-secondary-foreground text-xs">
                  {i + 1}
                </span>
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-2 font-mono text-sm">
                    <Terminal className="size-3.5 text-muted-foreground" />
                    <code>{s.cmd}</code>
                  </div>
                  <TypographyMuted className="text-xs">
                    {s.note}
                  </TypographyMuted>
                </div>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>
    </section>
  );
}
