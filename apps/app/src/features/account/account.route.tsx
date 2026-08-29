import { NavLink } from "@packages/ui/components/ui/nav-link";
import { TypographyH1, TypographyMuted } from "@packages/ui/components/ui/typography";
import { createFileRoute, Link } from "@tanstack/react-router";
import { RgpdDeletionCard } from "../rgpd/components/rgpd-deletion-card";
import { PasskeysCard } from "../security/components/passkeys-card";
import { RecoveryCodesCard } from "../security/components/recovery-codes-card";
import { TwoFactorCard } from "../security/components/two-factor-card";
import { ChangePasswordCard } from "./components/change-password-card";
import { ProfileCard } from "./components/profile-card";

export const Route = createFileRoute("/_protected/_shell/settings/account")({
  component: AccountPage,
});

function AccountPage() {
  const { user } = Route.useRouteContext();

  return (
    <main className="flex flex-col gap-6">
      <TypographyH1 className="sr-only">Account settings</TypographyH1>
      <ProfileCard name={user.name ?? ""} email={user.email} pendingEmail={user.pendingEmail} />
      <ChangePasswordCard />
      <PasskeysCard />
      <TwoFactorCard enabled={user.twoFactorEnabled === true} />
      {user.twoFactorEnabled === true && <RecoveryCodesCard />}
      <RgpdDeletionCard
        pendingDeletionUntil={user.pendingDeletionUntil}
        twoFactorEnabled={user.twoFactorEnabled === true}
      />
      <TypographyMuted>
        Read our{" "}
        <NavLink asChild variant="underline">
          <Link to="/legal/data-rights">data rights policy</Link>
        </NavLink>{" "}
        for the full breakdown of what&apos;s deleted, anonymized, and retained.
      </TypographyMuted>
    </main>
  );
}
