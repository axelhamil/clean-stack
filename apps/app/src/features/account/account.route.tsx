import { TypographyH1 } from "@packages/ui/components/ui/typography";
import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { RgpdDeletionCard } from "../rgpd/components/rgpd-deletion-card";
import { PasskeysCard } from "../security/components/passkeys-card";
import { RecoveryCodesCard } from "../security/components/recovery-codes-card";
import { TwoFactorCard } from "../security/components/two-factor-card";
import { ChangePasswordCard } from "./components/change-password-card";
import { DataRightsNotice } from "./components/data-rights-notice";
import { LanguageCard } from "./components/language-card";
import { ProfileCard } from "./components/profile-card";

export const Route = createFileRoute("/_protected/_shell/settings/account")({
  component: AccountPage,
});

function AccountPage() {
  const { t } = useTranslation("settings");
  const { user } = Route.useRouteContext();

  return (
    <main className="flex flex-col gap-6">
      <TypographyH1 className="sr-only">{t("account.title")}</TypographyH1>
      <ProfileCard name={user.name ?? ""} email={user.email} pendingEmail={user.pendingEmail} />
      <LanguageCard />
      <ChangePasswordCard />
      <PasskeysCard />
      <TwoFactorCard enabled={user.twoFactorEnabled === true} />
      {user.twoFactorEnabled === true && <RecoveryCodesCard />}
      <RgpdDeletionCard
        pendingDeletionUntil={user.pendingDeletionUntil}
        twoFactorEnabled={user.twoFactorEnabled === true}
      />
      <DataRightsNotice />
    </main>
  );
}
