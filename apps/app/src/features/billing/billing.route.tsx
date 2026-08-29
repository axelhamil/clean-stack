import { Button } from "@packages/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@packages/ui/components/ui/card";
import { Progress } from "@packages/ui/components/ui/progress";
import { TypographyH1 } from "@packages/ui/components/ui/typography";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { activeOrgQueryOptions } from "../../shared/api/queries/active-org";
import { orgMembersQueryOptions } from "../../shared/api/queries/org-members";
import { ensureOrgPermission } from "../../shared/auth/ensure-org-permission";
import { useEntitlements } from "../../shared/auth/use-entitlements";
import { PricingTable } from "../../shared/components/pricing-table";
import { useOpenPortal } from "./hooks/use-open-portal";

export const Route = createFileRoute("/_protected/_shell/settings/_org-scope/billing")({
  beforeLoad: ensureOrgPermission({ billing: ["manage"] }),
  component: BillingPage,
});

function BillingPage() {
  const { data: activeOrg } = useQuery(activeOrgQueryOptions);
  const { data: members = [] } = useQuery({
    ...orgMembersQueryOptions(activeOrg?.id ?? ""),
    enabled: !!activeOrg?.id,
  });
  const ent = useEntitlements();
  const portal = useOpenPortal();
  const isPaid = ent.tier !== "free";
  const memberCount = members.length;

  return (
    <main className="flex flex-col gap-6">
      <TypographyH1 className="sr-only">Billing settings</TypographyH1>
      <Card>
        <CardHeader>
          <CardTitle>Current plan: {ent.tier}</CardTitle>
          <CardDescription>Status: {ent.status}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {ent.maxMembers === null ? (
            <span>Unlimited members</span>
          ) : (
            <>
              <span>
                {memberCount} / {ent.maxMembers} members
              </span>
              <Progress value={(memberCount / ent.maxMembers) * 100} aria-label="Members usage" />
            </>
          )}
          {isPaid && (
            <Button onClick={() => portal.mutate()} disabled={portal.isPending}>
              Manage billing
            </Button>
          )}
        </CardContent>
      </Card>
      {!isPaid && (
        <PricingTable isAuthenticated currentTier={ent.tier} activeOrgId={activeOrg?.id ?? null} />
      )}
    </main>
  );
}
