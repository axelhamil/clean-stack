import { Button } from "@packages/ui/components/ui/button";
import { TypographyH1, TypographyMuted } from "@packages/ui/components/ui/typography";
import { Link } from "@tanstack/react-router";
import { ShieldIcon } from "lucide-react";
import { ThemeToggle } from "../../common/components/theme-toggle";
import { OrgSwitcher } from "../organization/_components/org-switcher";
import { SignOutButton } from "./_components/sign-out-button";

interface DashboardPageProps {
  user: { name?: string | null; email: string };
}

export function DashboardPage({ user }: DashboardPageProps) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-6 px-6 py-12">
      <header className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <TypographyH1 variant="page">Welcome, {user.name ?? user.email}</TypographyH1>

          <TypographyMuted>{user.email}</TypographyMuted>
        </div>

        <div className="flex items-center gap-2">
          <OrgSwitcher />
          <Button asChild variant="outline">
            <Link to="/account/security">
              <ShieldIcon />
              Security
            </Link>
          </Button>
          <ThemeToggle />
          <SignOutButton />
        </div>
      </header>
    </main>
  );
}
