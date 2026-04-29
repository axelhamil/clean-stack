import { TypographyMuted } from "@packages/ui/components/ui/typography";
import { Boxes } from "lucide-react";

export function SiteFooter() {
  return (
    <footer className="border-t">
      <div className="flex flex-col items-center justify-between gap-4 px-6 py-8 md:flex-row md:px-12">
        <div className="flex items-center gap-2">
          <Boxes className="size-4 text-muted-foreground" />
          <TypographyMuted>
            clean-stack — opinionated, so you stop arbitrating mid-sprint
          </TypographyMuted>
        </div>
        <TypographyMuted>
          MIT · No moral dependency on any stack
        </TypographyMuted>
      </div>
    </footer>
  );
}
