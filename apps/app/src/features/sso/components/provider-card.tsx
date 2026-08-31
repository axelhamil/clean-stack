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
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { formatApiError } from "../../../shared/api/errors/messages";
import { activeOrgQueryOptions } from "../../../shared/api/queries/active-org";
import {
  registerOidcProviderMutationOptions,
  registerSamlProviderMutationOptions,
} from "../api/sso.mutations";
import { primaryProviderFor, ssoProvidersQueryOptions } from "../api/sso.queries";
import { OidcProviderForm } from "../forms/oidc-provider-form";
import { SamlProviderForm } from "../forms/saml-provider-form";
import { isSsoProviderType, SSO_PROVIDER_TYPE_KEYS } from "../sso-labels";
import { CopyRow } from "./copy-row";

export function ProviderCard() {
  const qc = useQueryClient();
  const { t } = useTranslation("settings");
  const { t: tErrors } = useTranslation("errors");
  const { data: org } = useQuery(activeOrgQueryOptions);
  const { data: providers } = useQuery(ssoProvidersQueryOptions);
  const [kind, setKind] = useState<"oidc" | "saml">("oidc");

  const existing = primaryProviderFor(providers, org?.id);

  const onRegistered = () => {
    void qc.invalidateQueries({ queryKey: ssoProvidersQueryOptions.queryKey });
    toast.success(t("sso.providerCard.registeredToast"));
  };

  // `sso.register`'s error carries the API's business code inside `.message`
  // rather than a separate `.code` field (`assertSsoEntitlementFor` in
  // apps/api/src/auth.ts) — `{ code: err.message }` feeds that same string
  // into `formatApiError`'s `errors.byCode` lookup. Passing `err.message` as
  // the fallback too means an unrecognized code still surfaces the server's
  // own text unchanged, exactly as before this went through the catalog.
  const onRegisterError = (err: Error) =>
    toast.error(formatApiError({ code: err.message }, err.message, tErrors));

  const registerOidc = useMutation({
    ...registerOidcProviderMutationOptions,
    onSuccess: onRegistered,
    onError: onRegisterError,
  });
  const registerSaml = useMutation({
    ...registerSamlProviderMutationOptions,
    onSuccess: onRegistered,
    onError: onRegisterError,
  });

  const existingTypeLabel = existing
    ? isSsoProviderType(existing.type)
      ? t(SSO_PROVIDER_TYPE_KEYS[existing.type])
      : existing.type
    : "";

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("sso.providerCard.title")}</CardTitle>
        <CardDescription>{t("sso.providerCard.description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {existing ? (
          <div className="flex flex-col gap-3 rounded-md border p-4">
            <div className="flex items-center justify-between">
              <TypographySmall>
                {t("sso.providerCard.typeAndDomain", {
                  type: existingTypeLabel,
                  domain: existing.domain,
                })}
              </TypographySmall>
              <TypographyMuted>{existing.issuer}</TypographyMuted>
            </div>
            <CopyRow
              label={t("sso.providerCard.metadataUrlLabel")}
              value={existing.spMetadataUrl}
            />
            <TypographyMuted>{t("sso.providerCard.singleProviderNotice")}</TypographyMuted>
          </div>
        ) : (
          <Tabs value={kind} onValueChange={(v) => setKind(v as "oidc" | "saml")}>
            <TabsList>
              <TabsTrigger value="oidc">{t(SSO_PROVIDER_TYPE_KEYS.oidc)}</TabsTrigger>
              <TabsTrigger value="saml">{t(SSO_PROVIDER_TYPE_KEYS.saml)}</TabsTrigger>
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
