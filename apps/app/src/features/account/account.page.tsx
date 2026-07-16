import { TypographyH1 } from "@packages/ui/components/ui/typography";
import { getRouteApi } from "@tanstack/react-router";
import { DataExportCard } from "../rgpd/components/data-export-card";
import { PasskeysCard } from "../security/components/passkeys-card";
import { RecoveryCodesCard } from "../security/components/recovery-codes-card";
import { SessionsCard } from "../security/components/sessions-card";
import { TwoFactorCard } from "../security/components/two-factor-card";
import { ChangePasswordCard } from "./components/change-password-card";
import { ProfileCard } from "./components/profile-card";

const route = getRouteApi("/_protected/_shell/settings/account");

export function AccountPage() {
  const { user, sessionToken } = route.useRouteContext();

  return (
    <main className="flex flex-col gap-6">
      <TypographyH1 className="sr-only">Account settings</TypographyH1>
      <ProfileCard name={user.name ?? ""} email={user.email} pendingEmail={user.pendingEmail} />
      <ChangePasswordCard />
      <PasskeysCard />
      <TwoFactorCard enabled={user.twoFactorEnabled === true} />
      {user.twoFactorEnabled === true && <RecoveryCodesCard />}
      <SessionsCard currentSessionToken={sessionToken} />
      <DataExportCard lastExportRequestedAt={user.lastExportRequestedAt} />
    </main>
  );
}
