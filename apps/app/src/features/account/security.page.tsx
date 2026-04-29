import { Button } from "@packages/ui/components/ui/button";
import {
  TypographyH1,
  TypographyMuted,
} from "@packages/ui/components/ui/typography";
import { Link } from "@tanstack/react-router";
import { ArrowLeftIcon } from "lucide-react";
import { ThemeToggle } from "../../common/components/theme-toggle";
import { PasskeysCard } from "./_components/passkeys-card";
import { SessionsCard } from "./_components/sessions-card";
import { TwoFactorCard } from "./_components/two-factor-card";

interface SecurityPageProps {
  user: { twoFactorEnabled?: boolean | null };
  sessionToken: string;
}

export function SecurityPage({ user, sessionToken }: SecurityPageProps) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-8 px-6 py-12">
      <header className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <Button asChild variant="ghost" size="sm" className="w-fit -ml-2">
            <Link to="/dashboard">
              <ArrowLeftIcon />
              Back to dashboard
            </Link>
          </Button>
          <TypographyH1 variant="page">Security</TypographyH1>
          <TypographyMuted>
            Manage how you sign in and which devices stay logged in.
          </TypographyMuted>
        </div>
        <ThemeToggle />
      </header>

      <div className="flex flex-col gap-6">
        <PasskeysCard />
        <TwoFactorCard enabled={user.twoFactorEnabled === true} />
        <SessionsCard currentSessionToken={sessionToken} />
      </div>
    </main>
  );
}
