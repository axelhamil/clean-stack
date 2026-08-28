import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@packages/ui/components/ui/button";
import { Form } from "@packages/ui/components/ui/form";
import { FormTextField } from "@packages/ui/components/ui/form-text-field";
import { useForm } from "react-hook-form";
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
  const form = useForm<OidcProviderInput>({
    resolver: zodResolver(oidcProviderSchema),
    defaultValues: DEFAULT_VALUES,
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
        <FormTextField control={form.control} name="domain" label="Domain" placeholder="acme.com" />
        <FormTextField
          control={form.control}
          name="issuer"
          label="Issuer"
          placeholder="https://idp.acme.com"
        />
        <FormTextField control={form.control} name="clientId" label="Client ID" />
        <FormTextField
          control={form.control}
          name="clientSecret"
          label="Client secret"
          type="password"
        />
        <Button type="submit" disabled={isPending} className="w-fit">
          Register OIDC provider
        </Button>
      </form>
    </Form>
  );
}
