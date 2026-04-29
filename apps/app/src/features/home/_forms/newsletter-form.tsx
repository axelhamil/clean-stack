import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@packages/ui/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@packages/ui/components/ui/form";
import { Input } from "@packages/ui/components/ui/input";
import { useForm } from "react-hook-form";
import { useNewsletterSubscribe } from "../_hooks/use-newsletter-subscribe";
import {
  type NewsletterInput,
  newsletterSchema,
} from "../_schemas/newsletter.schema";

export function NewsletterForm() {
  const subscribe = useNewsletterSubscribe();
  const form = useForm<NewsletterInput>({
    resolver: zodResolver(newsletterSchema),
    defaultValues: { email: "" },
  });

  const onSubmit = form.handleSubmit((values) => subscribe.mutate(values));

  return (
    <Form {...form}>
      <form onSubmit={onSubmit} className="space-y-4">
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input
                  type="email"
                  placeholder="you@example.com"
                  disabled={subscribe.isPending}
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" className="w-full" disabled={subscribe.isPending}>
          {subscribe.isPending ? "Inscription..." : "S'inscrire"}
        </Button>
      </form>
    </Form>
  );
}
