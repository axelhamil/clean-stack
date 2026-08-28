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
  const form = useForm<SamlProviderInput>({
    resolver: zodResolver(samlProviderSchema),
    defaultValues: DEFAULT_VALUES,
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
        <FormTextField control={form.control} name="domain" label="Domain" placeholder="acme.com" />
        <FormTextField
          control={form.control}
          name="issuer"
          label="Issuer / entity ID"
          placeholder="acme-saml"
        />
        <FormTextField
          control={form.control}
          name="entryPoint"
          label="Entry point"
          placeholder="https://idp.acme.com/sso/saml"
        />
        <FormField
          control={form.control}
          name="cert"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Signing certificate</FormLabel>
              <FormControl>
                <Textarea rows={6} className="font-mono text-xs" {...field} />
              </FormControl>
              <FormDescription>The IdP's PEM-encoded X.509 certificate.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" disabled={isPending} className="w-fit">
          Register SAML provider
        </Button>
      </form>
    </Form>
  );
}
