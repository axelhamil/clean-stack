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
import { Textarea } from "@packages/ui/components/ui/textarea";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { type ImpersonateFormInput, impersonateFormSchema } from "../admin-users.schema";

interface ImpersonateFormProps {
  isPending: boolean;
  onSubmit: (values: ImpersonateFormInput) => void;
}

export function ImpersonateForm({ isPending, onSubmit }: ImpersonateFormProps) {
  const form = useForm<ImpersonateFormInput>({
    resolver: zodResolver(impersonateFormSchema),
    mode: "onChange",
    defaultValues: { reason: "", ticketRef: "" },
  });

  useEffect(() => {
    void form.trigger();
  }, [form.trigger]);

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
        <FormField
          control={form.control}
          name="reason"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Justification</FormLabel>
              <FormControl>
                <Textarea placeholder="Décrivez la raison de l'impersonation…" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="ticketRef"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Référence ticket (optionnel)</FormLabel>
              <FormControl>
                <Input placeholder="SUP-42" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" disabled={!form.formState.isValid || isPending}>
          Démarrer l'impersonation
        </Button>
      </form>
    </Form>
  );
}
