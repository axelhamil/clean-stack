import { BrandLink } from "@packages/ui/components/ui/brand-link";
import { Button } from "@packages/ui/components/ui/button";
import { KeyboardShortcut } from "@packages/ui/components/ui/keyboard-shortcut";
import { NavLink } from "@packages/ui/components/ui/nav-link";
import { Separator } from "@packages/ui/components/ui/separator";
import { Link, useRouterState } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { LogoMark } from "../../shared/components/logo-mark";
import { ThemeToggle } from "../../shared/components/theme-toggle";
import { AuthorizationDevTool } from "../auth/authorization-devtool";
import { CommandPalette } from "./command-palette";
import { ContextualTabs } from "./contextual-tabs";
import { OrgSwitcher } from "./org-switcher";
import { UserMenu } from "./user-menu";

interface AppShellProps {
  user: { name?: string | null; email: string };
  children: React.ReactNode;
}

const PRIMARY_NAV = [
  { to: "/dashboard", label: "Dashboard" },
  { to: "/settings", label: "Settings" },
] as const;

function isApplePlatform(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent ?? "";
  return /Mac|iPhone|iPad|iPod/.test(ua);
}

const SHORTCUT_LABEL = isApplePlatform() ? "⌘ K" : "Ctrl K";

export function AppShell({ user, children }: AppShellProps) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const fireCommandPalette = () => {
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "k", metaKey: true, ctrlKey: true, bubbles: true }),
    );
  };

  return (
    <>
      <header className="glass-header sticky top-0 z-30 border-b">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-4 sm:px-6">
          <BrandLink asChild>
            <Link to="/dashboard">
              <LogoMark />
              <span className="hidden sm:inline">App</span>
            </Link>
          </BrandLink>

          <Separator orientation="vertical" className="h-5" />

          <OrgSwitcher />

          <nav className="ml-2 hidden items-center gap-1 md:flex">
            {PRIMARY_NAV.map((item) => {
              const active =
                item.to === "/dashboard"
                  ? pathname === item.to
                  : pathname === item.to || pathname.startsWith(`${item.to}/`);

              return (
                <NavLink key={item.to} variant="pill" active={active} asChild>
                  <Link to={item.to}>{item.label}</Link>
                </NavLink>
              );
            })}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={fireCommandPalette}
              className="hidden h-9 gap-2 text-muted-foreground sm:inline-flex"
            >
              <Search className="size-4" />
              <span>Search...</span>
              <KeyboardShortcut className="ml-2">{SHORTCUT_LABEL}</KeyboardShortcut>
            </Button>

            <Button
              variant="ghost"
              size="icon"
              onClick={fireCommandPalette}
              className="sm:hidden"
              aria-label="Open command palette"
            >
              <Search />
            </Button>

            <ThemeToggle />

            <UserMenu user={user} />
          </div>
        </div>

        {pathname.startsWith("/settings") && (
          <ContextualTabs className="border-t mx-auto max-w-7xl px-4 sm:px-6" />
        )}
      </header>

      {children}

      <CommandPalette />
      <AuthorizationDevTool />
    </>
  );
}
