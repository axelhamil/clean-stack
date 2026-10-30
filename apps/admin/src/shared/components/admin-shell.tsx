import { Button } from "@packages/ui/components/ui/button";
import { IconButton } from "@packages/ui/components/ui/icon-button";
import { NavLink } from "@packages/ui/components/ui/nav-link";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@packages/ui/components/ui/sheet";
import { SidebarLayout } from "@packages/ui/components/ui/sidebar-layout";
import { TruncatedText } from "@packages/ui/components/ui/truncated-text";
import { TypographyInline } from "@packages/ui/components/ui/typography";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Link, useRouterState } from "@tanstack/react-router";
import { MenuIcon } from "lucide-react";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { meQueryOptions } from "../api/queries/me";
import { useSignOut } from "../auth/use-sign-out";
import { sectionsOpenTo } from "../nav/sections";

interface AdminShellProps {
  children: ReactNode;
}

interface ShellNavProps {
  onNavigate?: () => void;
}

function ShellNav({ onNavigate }: ShellNavProps) {
  const { t } = useTranslation("admin");
  const { data: me } = useSuspenseQuery(meQueryOptions);
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  return (
    <nav aria-label={t("backOffice.nav.label")} className="flex flex-1 flex-col gap-1">
      <NavLink variant="pill" active={pathname === "/"} asChild>
        <Link to="/" onClick={onNavigate}>
          {t("backOffice.home.title")}
        </Link>
      </NavLink>
      {sectionsOpenTo(me.permissions).map((section) => (
        <NavLink key={section.id} variant="pill" active={pathname === `/${section.id}`} asChild>
          <Link to="/$section" params={{ section: section.id }} onClick={onNavigate}>
            {t(`backOffice.sections.${section.id}`)}
          </Link>
        </NavLink>
      ))}
    </nav>
  );
}

function ShellAccount() {
  const { t } = useTranslation("common");
  const { data: me } = useSuspenseQuery(meQueryOptions);
  const signOut = useSignOut();

  return (
    <div className="flex flex-col gap-2">
      <TruncatedText value={me.email} />
      <Button
        variant="outline"
        size="sm"
        disabled={signOut.isPending}
        onClick={() => signOut.mutate()}
      >
        {t("userMenu.signOut")}
      </Button>
    </div>
  );
}

function ShellBrand() {
  const { t } = useTranslation("admin");

  return <TypographyInline className="font-semibold">{t("backOffice.brand")}</TypographyInline>;
}

export function AdminShell({ children }: AdminShellProps) {
  const { t } = useTranslation(["admin", "common"]);
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <SidebarLayout
      sidebar={
        <>
          <ShellBrand />
          <ShellNav />
          <ShellAccount />
        </>
      }
      topBar={
        <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
          <SheetTrigger asChild>
            <IconButton variant="ghost" label={t("backOffice.nav.open")}>
              <MenuIcon />
            </IconButton>
          </SheetTrigger>
          <ShellBrand />
          <SheetContent side="left" closeLabel={t("common:actions.close")} className="p-4">
            <SheetHeader>
              <SheetTitle>{t("backOffice.brand")}</SheetTitle>
              <SheetDescription>{t("backOffice.nav.description")}</SheetDescription>
            </SheetHeader>
            <ShellNav onNavigate={() => setDrawerOpen(false)} />
            <ShellAccount />
          </SheetContent>
        </Sheet>
      }
    >
      {children}
    </SidebarLayout>
  );
}
