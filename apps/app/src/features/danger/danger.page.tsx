import { NavLink } from "@packages/ui/components/ui/nav-link";
import { TypographyH1, TypographyMuted } from "@packages/ui/components/ui/typography";
import { getRouteApi, Link } from "@tanstack/react-router";
import { RgpdDeletionCard } from "../rgpd/components/rgpd-deletion-card";
import { OrgDangerCard } from "./components/org-danger-card";

const route = getRouteApi("/_protected/_shell/settings/danger");

export function DangerPage() {
  const { user } = route.useRouteContext();

  return (
    <main className="flex flex-col gap-6">
      <TypographyH1 className="sr-only">Danger zone</TypographyH1>
      <OrgDangerCard />
      <RgpdDeletionCard
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
