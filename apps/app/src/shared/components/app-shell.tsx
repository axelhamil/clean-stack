import { BrandLink } from "@packages/ui/components/ui/brand-link";
import { Button } from "@packages/ui/components/ui/button";
import { KeyboardShortcut } from "@packages/ui/components/ui/keyboard-shortcut";
import { NavLink } from "@packages/ui/components/ui/nav-link";
import { pageContainerVariants } from "@packages/ui/components/ui/page-container";
import { Separator } from "@packages/ui/components/ui/separator";
import { cn } from "@packages/ui/libs/utils.js";
import { Link, useRouterState } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import { AuthorizationDevTool } from "../auth/authorization-devtool";
import { NotificationBell } from "../notifications/notification-bell";
import { CommandPalette } from "./command-palette";
import { ContextualTabs } from "./contextual-tabs";
import { ImpersonationBanner } from "./impersonation-banner";
import { LegalFooter } from "./legal-footer";
import { LogoMark } from "./logo-mark";
import { OrgSwitcher } from "./org-switcher";
import { ThemeToggle } from "./theme-toggle";
import { usePrimaryNav } from "./use-primary-nav";
import { UserMenu } from "./user-menu";

interface AppShellProps {
  user: { name?: string | null; email: string };
  children: React.ReactNode;
}

function isApplePlatform(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent ?? "";
  return /Mac|iPhone|iPad|iPod/.test(ua);
}

const SHORTCUT_LABEL = isApplePlatform() ? "⌘ K" : "Ctrl K";

export function AppShell({ user, children }: AppShellProps) {
  const { t } = useTranslation("common");
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const primaryNav = usePrimaryNav();

  const fireCommandPalette = () => {
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "k", metaKey: true, ctrlKey: true, bubbles: true }),
    );
  };

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 border-b bg-background">
        <div className={cn(pageContainerVariants(), "flex h-14 items-center gap-2 sm:gap-4")}>
          <BrandLink asChild>
            <Link to="/dashboard">
              <LogoMark />
              <span className="hidden sm:inline">{t("shell.brandLabel")}</span>
            </Link>
          </BrandLink>

          <Separator orientation="vertical" className="h-5" />

          <OrgSwitcher />

          <nav className="hidden shrink-0 items-center gap-1 md:flex">
            {primaryNav.map((item) => (
              <NavLink key={item.to} variant="pill" active={item.active} asChild>
                <Link to={item.to}>{t(item.labelKey)}</Link>
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto flex shrink-0 items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              onClick={fireCommandPalette}
              className="hidden h-9 gap-2 text-muted-foreground lg:inline-flex"
            >
              <Search className="size-4" />
              <span>{t("shell.search")}</span>
              <KeyboardShortcut className="ml-2">{SHORTCUT_LABEL}</KeyboardShortcut>
            </Button>

            <Button
              variant="ghost"
              size="icon"
              onClick={fireCommandPalette}
              className="lg:hidden"
              aria-label={t("shell.openCommandPalette")}
            >
              <Search />
            </Button>

            <NotificationBell />

            <ThemeToggle />

            <UserMenu user={user} />
          </div>
        </div>

        {pathname.startsWith("/settings") && (
          <div className="border-t">
            <ContextualTabs className={pageContainerVariants()} />
          </div>
        )}
      </header>

      <ImpersonationBanner />

      <div className="flex-1">{children}</div>

      <LegalFooter />

      <CommandPalette />
      <AuthorizationDevTool />
    </div>
  );
}
