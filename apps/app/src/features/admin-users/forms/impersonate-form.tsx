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
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { type ImpersonateFormInput, impersonateFormSchema } from "../admin-users.schema";

interface ImpersonateFormProps {
  isPending: boolean;
  onSubmit: (values: ImpersonateFormInput) => void;
}

export function ImpersonateForm({ isPending, onSubmit }: ImpersonateFormProps) {
  const { t } = useTranslation("admin");
  const form = useForm<ImpersonateFormInput>({
    resolver: zodResolver(impersonateFormSchema),
    mode: "onChange",
    defaultValues: { reason: "", ticketRef: "" },
  });

  const reason = form.watch("reason");

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
        <FormField
          control={form.control}
          name="reason"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("users.impersonateForm.reasonLabel")}</FormLabel>
              <FormControl>
                <Textarea placeholder={t("users.impersonateForm.reasonPlaceholder")} {...field} />
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
              <FormLabel>{t("users.impersonateForm.ticketRefLabel")}</FormLabel>
              <FormControl>
                <Input placeholder={t("users.impersonateForm.ticketRefPlaceholder")} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" disabled={!reason.trim() || isPending}>
          {t("users.impersonateForm.submit")}
        </Button>
      </form>
    </Form>
  );
}
