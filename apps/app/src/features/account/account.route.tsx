import { NavLink } from "@packages/ui/components/ui/nav-link";
import { TypographyH1, TypographyMuted } from "@packages/ui/components/ui/typography";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Trans, useTranslation } from "react-i18next";
import { RgpdDeletionCard } from "../rgpd/components/rgpd-deletion-card";
import { PasskeysCard } from "../security/components/passkeys-card";
import { RecoveryCodesCard } from "../security/components/recovery-codes-card";
import { TwoFactorCard } from "../security/components/two-factor-card";
import { ChangePasswordCard } from "./components/change-password-card";
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
      <TypographyMuted>
        <Trans
          ns="settings"
          i18nKey="account.dataRightsNotice"
          components={{
            link: (
              <NavLink asChild variant="underline">
                <Link to="/legal/data-rights" />
              </NavLink>
            ),
          }}
        />
      </TypographyMuted>
    </main>
  );
}
