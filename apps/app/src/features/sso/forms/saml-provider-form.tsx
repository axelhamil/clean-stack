import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@packages/ui/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@packages/ui/components/ui/form";
import { FormTextField } from "@packages/ui/components/ui/form-text-field";
import { Textarea } from "@packages/ui/components/ui/textarea";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { type SamlProviderInput, samlProviderSchema } from "../sso.schema";

const DEFAULT_VALUES: SamlProviderInput = {
  domain: "",
  entryPoint: "",
  issuer: "",
  cert: "",
};

interface SamlProviderFormProps {
  isPending: boolean;
  onSubmit: (values: SamlProviderInput) => void;
}

export function SamlProviderForm({ isPending, onSubmit }: SamlProviderFormProps) {
  const { t } = useTranslation("settings");
  const form = useForm<SamlProviderInput>({
    resolver: zodResolver(samlProviderSchema),
    defaultValues: DEFAULT_VALUES,
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
        <FormTextField
          control={form.control}
          name="domain"
          label={t("sso.forms.saml.domainLabel")}
          placeholder={t("sso.forms.saml.domainPlaceholder")}
        />
        <FormTextField
          control={form.control}
          name="issuer"
          label={t("sso.forms.saml.issuerLabel")}
          placeholder={t("sso.forms.saml.issuerPlaceholder")}
        />
        <FormTextField
          control={form.control}
          name="entryPoint"
          label={t("sso.forms.saml.entryPointLabel")}
          placeholder={t("sso.forms.saml.entryPointPlaceholder")}
        />
        <FormField
          control={form.control}
          name="cert"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("sso.forms.saml.certLabel")}</FormLabel>
              <FormControl>
                <Textarea rows={6} className="font-mono text-xs" {...field} />
              </FormControl>
              <FormDescription>{t("sso.forms.saml.certDescription")}</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" disabled={isPending} className="w-fit">
          {t("sso.forms.saml.submitAction")}
        </Button>
      </form>
    </Form>
  );
}
