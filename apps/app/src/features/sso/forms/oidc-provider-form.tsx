import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@packages/ui/components/ui/button";
import { Form } from "@packages/ui/components/ui/form";
import { FormTextField } from "@packages/ui/components/ui/form-text-field";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { type OidcProviderInput, oidcProviderSchema } from "../sso.schema";

const DEFAULT_VALUES: OidcProviderInput = {
  domain: "",
  issuer: "",
  clientId: "",
  clientSecret: "",
};

interface OidcProviderFormProps {
  isPending: boolean;
  onSubmit: (values: OidcProviderInput) => void;
}

export function OidcProviderForm({ isPending, onSubmit }: OidcProviderFormProps) {
  const { t } = useTranslation("settings");
  const form = useForm<OidcProviderInput>({
    resolver: zodResolver(oidcProviderSchema),
    defaultValues: DEFAULT_VALUES,
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
        <FormTextField
          control={form.control}
          name="domain"
          label={t("sso.forms.oidc.domainLabel")}
          placeholder={t("sso.forms.oidc.domainPlaceholder")}
        />
        <FormTextField
          control={form.control}
          name="issuer"
          label={t("sso.forms.oidc.issuerLabel")}
          placeholder={t("sso.forms.oidc.issuerPlaceholder")}
        />
        <FormTextField
          control={form.control}
          name="clientId"
          label={t("sso.forms.oidc.clientIdLabel")}
        />
        <FormTextField
          control={form.control}
          name="clientSecret"
          label={t("sso.forms.oidc.clientSecretLabel")}
          type="password"
        />
        <Button type="submit" disabled={isPending} className="w-fit">
          {t("sso.forms.oidc.submitAction")}
        </Button>
      </form>
    </Form>
  );
}
