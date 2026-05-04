import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@packages/ui/components/ui/card";
import { Input } from "@packages/ui/components/ui/input";
import { Label } from "@packages/ui/components/ui/label";
import { NavLink } from "@packages/ui/components/ui/nav-link";
import { TypographyH1, TypographyMuted } from "@packages/ui/components/ui/typography";
import { getRouteApi, Link } from "@tanstack/react-router";
import { DataExportCard } from "../gdpr/components/data-export-card";
import { GdprDeletionCard } from "../gdpr/components/gdpr-deletion-card";
import { PasskeysCard } from "../security/components/passkeys-card";
import { SessionsCard } from "../security/components/sessions-card";
import { TwoFactorCard } from "../security/components/two-factor-card";

const route = getRouteApi("/_protected/_shell/settings/account");

export function AccountPage() {
  const { user, sessionToken } = route.useRouteContext();

  return (
    <main className="flex flex-col gap-6">
      <TypographyH1 className="sr-only">Account settings</TypographyH1>
      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>Your personal information.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="account-name">Name</Label>
            <Input id="account-name" defaultValue={user.name ?? ""} disabled />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="account-email">Email</Label>
            <Input id="account-email" type="email" value={user.email} disabled />
          </div>
        </CardContent>
      </Card>

      <PasskeysCard />
      <TwoFactorCard enabled={user.twoFactorEnabled === true} />
      <SessionsCard currentSessionToken={sessionToken} />
      <DataExportCard lastExportRequestedAt={user.lastExportRequestedAt} />
      <GdprDeletionCard
        pendingDeletionUntil={user.pendingDeletionUntil}
        twoFactorEnabled={user.twoFactorEnabled === true}
      />
      <TypographyMuted>
        Read our{" "}
        <NavLink asChild variant="underline">
          <Link to="/legal/data-rights">data rights policy</Link>
        </NavLink>{" "}
        for the full breakdown of what's deleted, anonymized, and retained.
      </TypographyMuted>
    </main>
  );
}
