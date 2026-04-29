import { Badge } from "@packages/ui/components/ui/badge";
import { Button } from "@packages/ui/components/ui/button";
import { Boxes, Code2 } from "lucide-react";
import { ThemeToggle } from "../../../common/ui/theme-toggle";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex h-16 items-center justify-between px-6 md:px-12">
        <div className="flex items-center gap-2">
          <Boxes className="size-5" />
          <span className="font-semibold">clean-stack</span>
          <Badge variant="secondary" className="ml-2">
            v1.2.0
          </Badge>
        </div>
        <nav className="hidden items-center gap-6 text-muted-foreground text-sm md:flex">
          <a href="#stack" className="transition-colors hover:text-foreground">
            Stack
          </a>
          <a
            href="#architecture"
            className="transition-colors hover:text-foreground"
          >
            Architecture
          </a>
          <a
            href="#newsletter"
            className="transition-colors hover:text-foreground"
          >
            Newsletter
          </a>
        </nav>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" asChild>
            <a
              href="https://github.com/axelhamil/clean-stack"
              target="_blank"
              rel="noreferrer"
              aria-label="GitHub"
            >
              <Code2 className="size-4" />
            </a>
          </Button>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
