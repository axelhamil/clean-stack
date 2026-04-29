import { Badge } from "@packages/ui/components/ui/badge";
import { Card, CardContent } from "@packages/ui/components/ui/card";
import {
  TypographyH2,
  TypographyInlineCode,
  TypographyMuted,
  TypographyP,
} from "@packages/ui/components/ui/typography";
import { Bot, FileCode2, Sparkles } from "lucide-react";

const rules = [
  "Domain has zero external imports",
  "No throw, no null — Result + Option",
  "No barrel index.ts",
  "Unidirectional imports: routes → features → adapters → common",
  "Forms in RHF + zodResolver, isolated under _forms/",
  "DDD scoped to billable business logic — never billing/auth",
];

const agents = ["Claude Code", "Cursor", "Zed", "Windsurf", "Codex"];

export function AiReady() {
  return (
    <section id="ai-ready" className="space-y-6">
      <div className="space-y-2 text-center">
        <Badge variant="outline" className="mx-auto">
          <Sparkles className="size-3 animate-float-y" />
          AI-pair ready
          <span className="live-dot ml-1" aria-hidden />
        </Badge>
        <TypographyH2 className="border-0 pb-0">
          Your agent already knows the rules
        </TypographyH2>
        <TypographyMuted>
          A 450-line <TypographyInlineCode>CLAUDE.md</TypographyInlineCode>{" "}
          shipped at the root. Architecture, DDD scope, naming conventions, form
          contracts, banned anti-patterns — all documented as agent context.
        </TypographyMuted>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardContent className="space-y-4 pt-6">
            <div className="flex items-center gap-2">
              <FileCode2 className="size-4 text-muted-foreground" />
              <TypographyP className="font-medium">
                A few of the rules your agent will follow
              </TypographyP>
            </div>
            <ul className="space-y-2">
              {rules.map((r) => (
                <li
                  key={r}
                  className="flex items-start gap-2 text-muted-foreground text-sm"
                >
                  <span className="mt-1 size-1.5 shrink-0 rounded-full bg-foreground/40" />
                  {r}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-4 pt-6">
            <div className="flex items-center gap-2">
              <Bot className="size-4 text-muted-foreground" />
              <TypographyP className="font-medium">
                Compatible with your AI stack
              </TypographyP>
            </div>
            <div className="flex flex-wrap gap-2">
              {agents.map((a) => (
                <Badge key={a} variant="secondary">
                  {a}
                </Badge>
              ))}
            </div>
            <TypographyMuted className="text-sm">
              The <TypographyInlineCode>CLAUDE.md</TypographyInlineCode> file is
              read natively by Claude Code and recognized as context by agents
              that follow the convention. No more pasting your rules into every
              session.
            </TypographyMuted>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
