import { Badge } from "@packages/ui/components/ui/badge";
import { Button } from "@packages/ui/components/ui/button";
import { NavLink } from "@packages/ui/components/ui/nav-link";
import { Link } from "@tanstack/react-router";
import { Boxes, Code2 } from "lucide-react";
import { ThemeToggle } from "../../../common/ui/theme-toggle";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur supports-backdrop-filter:bg-background/60">
      <div className="grid h-16 grid-cols-[1fr_auto_1fr] items-center px-6 md:px-12">
        <div className="flex items-center gap-2 justify-self-start">
          <Boxes className="size-5" />
          <span className="font-semibold">clean-stack</span>
          <Badge variant="secondary" className="ml-2">
            v1.4.0
          </Badge>
        </div>
        <nav className="hidden items-center gap-6 justify-self-center md:flex">
          <NavLink asChild>
            <Link to="." hash="lean">
              Lean
            </Link>
          </NavLink>
          <NavLink asChild>
            <Link to="." hash="integrations">
              Integrations
            </Link>
          </NavLink>
          <NavLink asChild>
            <Link to="." hash="in-the-box">
              What's shipped
            </Link>
          </NavLink>
          <NavLink asChild>
            <Link to="." hash="architecture">
              Architecture
            </Link>
          </NavLink>
          <NavLink asChild>
            <Link to="." hash="ai-ready">
              AI-ready
            </Link>
          </NavLink>
          <NavLink asChild>
            <Link to="." hash="quick-start">
              Quick start
            </Link>
          </NavLink>
        </nav>
        <div className="flex items-center gap-2 justify-self-end">
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
