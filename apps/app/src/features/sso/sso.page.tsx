import { Button } from "@packages/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@packages/ui/components/ui/card";
import { TypographyH1 } from "@packages/ui/components/ui/typography";
import { Link } from "@tanstack/react-router";
import { useEntitlements } from "../../shared/auth/use-entitlements";
import { DomainVerificationCard } from "./components/domain-verification-card";
import { ProviderCard } from "./components/provider-card";
import { ScimConnectionCard } from "./components/scim-connection-card";
import { SsoEnforcementCard } from "./components/sso-enforcement-card";

export function SsoPage() {
  const { hasFeature } = useEntitlements();

  return (
    <main className="flex flex-col gap-6">
      <TypographyH1 className="sr-only">Single sign-on</TypographyH1>
      {hasFeature("sso") ? (
        <>
          <ProviderCard />
          <DomainVerificationCard />
          <SsoEnforcementCard />
          <ScimConnectionCard />
        </>
      ) : (
        <SsoUpsell />
      )}
    </main>
  );
}

function SsoUpsell() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Single sign-on</CardTitle>
        <CardDescription>
          Let members sign in through your identity provider (OIDC or SAML), provision accounts via
          SCIM, and enforce SSO across a verified domain.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button asChild>
          <Link to="/pricing" search={{ plan: "business" }}>
            Upgrade to the Business plan
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
