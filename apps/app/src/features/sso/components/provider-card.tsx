import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@packages/ui/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@packages/ui/components/ui/tabs";
import { TypographyMuted, TypographySmall } from "@packages/ui/components/ui/typography";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { activeOrgQueryOptions } from "../../../shared/api/queries/active-org";
import {
  registerOidcProviderMutationOptions,
  registerSamlProviderMutationOptions,
} from "../api/sso.mutations";
import { primaryProviderFor, ssoProvidersQueryOptions } from "../api/sso.queries";
import { OidcProviderForm } from "../forms/oidc-provider-form";
import { SamlProviderForm } from "../forms/saml-provider-form";
import { CopyRow } from "./copy-row";

function friendlyRegisterError(message: string): string {
  if (message === "SSO_PLAN_REQUIRED") return "Your plan does not include SSO.";
  if (message === "SSO_ORGANIZATION_REQUIRED") return "No active organization.";
  return message;
}

export function ProviderCard() {
  const qc = useQueryClient();
  const { data: org } = useQuery(activeOrgQueryOptions);
  const { data: providers } = useQuery(ssoProvidersQueryOptions);
  const [kind, setKind] = useState<"oidc" | "saml">("oidc");

  const existing = primaryProviderFor(providers, org?.id);

  const onRegistered = () => {
    void qc.invalidateQueries({ queryKey: ssoProvidersQueryOptions.queryKey });
    toast.success("SSO provider registered");
  };

  const registerOidc = useMutation({
    ...registerOidcProviderMutationOptions,
    onSuccess: onRegistered,
    onError: (err) => toast.error(friendlyRegisterError(err.message)),
  });
  const registerSaml = useMutation({
    ...registerSamlProviderMutationOptions,
    onSuccess: onRegistered,
    onError: (err) => toast.error(friendlyRegisterError(err.message)),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Identity provider</CardTitle>
        <CardDescription>
          Connect the OIDC or SAML application your identity provider issues so members on your
          domain can sign in through it.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {existing ? (
          <div className="flex flex-col gap-3 rounded-md border p-4">
            <div className="flex items-center justify-between">
              <TypographySmall>
                {existing.type.toUpperCase()} provider for {existing.domain}
              </TypographySmall>
              <TypographyMuted>{existing.issuer}</TypographyMuted>
            </div>
            <CopyRow label="SP metadata URL" value={existing.spMetadataUrl} />
            <TypographyMuted>
              This page manages one identity provider per organization. To switch identity
              providers, update or remove this one through the SSO API first.
            </TypographyMuted>
          </div>
        ) : (
          <Tabs value={kind} onValueChange={(v) => setKind(v as "oidc" | "saml")}>
            <TabsList>
              <TabsTrigger value="oidc">OIDC</TabsTrigger>
              <TabsTrigger value="saml">SAML</TabsTrigger>
            </TabsList>
            <TabsContent value="oidc">
              <OidcProviderForm
                isPending={registerOidc.isPending}
                onSubmit={(values) =>
                  org && registerOidc.mutate({ organizationId: org.id, values })
                }
              />
            </TabsContent>
            <TabsContent value="saml">
              <SamlProviderForm
                isPending={registerSaml.isPending}
                onSubmit={(values) =>
                  org && registerSaml.mutate({ organizationId: org.id, values })
                }
              />
            </TabsContent>
          </Tabs>
        )}
      </CardContent>
    </Card>
  );
}
