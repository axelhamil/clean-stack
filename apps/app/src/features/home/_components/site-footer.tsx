import { TypographyMuted } from "@packages/ui/components/ui/typography";
import { Boxes } from "lucide-react";

export function SiteFooter() {
  return (
    <footer className="border-t">
      <div className="flex flex-col items-center justify-between gap-4 px-6 py-8 md:flex-row md:px-12">
        <div className="flex items-center gap-2">
          <Boxes className="size-4 text-muted-foreground" />
          <TypographyMuted>
            clean-stack — boilerplate Clean Architecture + DDD
          </TypographyMuted>
        </div>
        <TypographyMuted>
          Bun · Hono · React 19 · Drizzle · DDD-kit
        </TypographyMuted>
      </div>
    </footer>
  );
}
