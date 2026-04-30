import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@packages/ui/components/ui/button";
import { Form } from "@packages/ui/components/ui/form";
import { FormTextField } from "@packages/ui/components/ui/form-text-field";
import { useForm } from "react-hook-form";
import { type MagicLinkInput, magicLinkSchema } from "../../../adapters/schemas/auth.schema";
import { useMagicLink } from "../_hooks/use-magic-link";

export function MagicLinkForm() {
  const mutation = useMagicLink();

  const form = useForm<MagicLinkInput>({
    resolver: zodResolver(magicLinkSchema),
    defaultValues: { email: "" },
  });

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit((v) => mutation.mutate(v))}
        className="flex flex-col gap-4"
        noValidate
      >
        <FormTextField
          control={form.control}
          name="email"
          label="Email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
        />

        <Button type="submit" variant="outline" className="w-full" disabled={mutation.isPending}>
          {mutation.isPending ? "Sending…" : "Email me a magic link"}
        </Button>
      </form>
    </Form>
  );
}
