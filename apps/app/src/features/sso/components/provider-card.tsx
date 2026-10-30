import { SettingsSection } from "@packages/ui/components/ui/settings-section";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@packages/ui/components/ui/tabs";
import { TypographyMuted, TypographySmall } from "@packages/ui/components/ui/typography";
import { formatApiError } from "@packages/web-kit/api/errors/messages";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { activeOrgQueryOptions } from "../../../shared/api/queries/active-org";
import {
  registerOidcProviderMutationOptions,
  registerSamlProviderMutationOptions,
} from "../api/sso.mutations";
import { primaryProviderFor, ssoProvidersQueryOptions } from "../api/sso.queries";
import { OidcProviderForm } from "../forms/oidc-provider-form";
import { SamlProviderForm } from "../forms/saml-provider-form";
import { isSsoProviderType, SSO_PROVIDER_TYPE_KEYS, type SsoProviderType } from "../sso-labels";
import { CopyRow } from "./copy-row";

export function ProviderCard() {
  const qc = useQueryClient();
  const { t } = useTranslation("settings");
  const { t: tErrors } = useTranslation("errors");
  const { data: org } = useQuery(activeOrgQueryOptions);
  const { data: providers } = useQuery(ssoProvidersQueryOptions);
  const [kind, setKind] = useState<SsoProviderType>("oidc");

  const existing = primaryProviderFor(providers, org?.id);

  const onRegistered = () => {
    void qc.invalidateQueries({ queryKey: ssoProvidersQueryOptions.queryKey });
    toast.success(t("sso.providerCard.registeredToast"));
  };

  // `sso.register`'s error carries the API's business code inside `.message`
  // rather than a separate `.code` field (`assertSsoEntitlementFor` in
  // apps/api/src/auth.ts), so `{ code: err.message }` feeds that string into
  // `formatApiError`'s `errors.byCode` lookup. Passing `err.message` as the
  // fallback too means an unrecognized code still surfaces the server's own text.
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

  const typeLabel = (type: string) =>
    isSsoProviderType(type) ? t(SSO_PROVIDER_TYPE_KEYS[type]) : type;

  return (
    <SettingsSection
      title={t("sso.providerCard.title")}
      description={t("sso.providerCard.description")}
    >
      {existing ? (
        <>
          <div className="flex flex-col gap-1">
            <TypographySmall>
              {t("sso.providerCard.typeAndDomain", {
                type: typeLabel(existing.type),
                domain: existing.domain,
              })}
            </TypographySmall>
            <TypographyMuted className="break-all">{existing.issuer}</TypographyMuted>
          </div>
          <CopyRow label={t("sso.providerCard.metadataUrlLabel")} value={existing.spMetadataUrl} />
          <TypographyMuted>{t("sso.providerCard.singleProviderNotice")}</TypographyMuted>
        </>
      ) : (
        <Tabs value={kind} onValueChange={(v) => isSsoProviderType(v) && setKind(v)}>
          <TabsList>
            <TabsTrigger value="oidc">{t(SSO_PROVIDER_TYPE_KEYS.oidc)}</TabsTrigger>
            <TabsTrigger value="saml">{t(SSO_PROVIDER_TYPE_KEYS.saml)}</TabsTrigger>
          </TabsList>
          <TabsContent value="oidc">
            <OidcProviderForm
              isPending={registerOidc.isPending}
              onSubmit={(values) => org && registerOidc.mutate({ organizationId: org.id, values })}
            />
          </TabsContent>
          <TabsContent value="saml">
            <SamlProviderForm
              isPending={registerSaml.isPending}
              onSubmit={(values) => org && registerSaml.mutate({ organizationId: org.id, values })}
            />
          </TabsContent>
        </Tabs>
      )}
    </SettingsSection>
  );
}
