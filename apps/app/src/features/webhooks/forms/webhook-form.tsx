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
import { FormTextField } from "@packages/ui/components/ui/form-text-field";
import { Switch } from "@packages/ui/components/ui/switch";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { type WebhookFormInput, webhookFormSchema } from "../webhooks.schema";
import { EventTypePicker } from "./event-type-picker";

interface WebhookFormProps {
  defaultValues: WebhookFormInput;
  submitLabel: string;
  isPending: boolean;
  onSubmit: (values: WebhookFormInput) => void;
}

export function WebhookForm({ defaultValues, submitLabel, isPending, onSubmit }: WebhookFormProps) {
  const { t } = useTranslation("settings");
  const form = useForm<WebhookFormInput>({
    resolver: zodResolver(webhookFormSchema),
    defaultValues,
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <FormTextField
          control={form.control}
          name="url"
          label={t("webhooks.form.urlLabel")}
          placeholder={t("webhooks.form.urlPlaceholder")}
        />
        <FormField
          control={form.control}
          name="eventTypes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("webhooks.form.subscribedEventsLabel")}</FormLabel>
              <FormControl>
                <EventTypePicker value={field.value} onChange={field.onChange} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="enabled"
          render={({ field }) => (
            <FormItem className="flex items-center justify-between">
              <FormLabel>{t("webhooks.form.enabledLabel")}</FormLabel>
              <FormControl>
                <Switch checked={field.value} onCheckedChange={field.onChange} />
              </FormControl>
            </FormItem>
          )}
        />
        <Button type="submit" disabled={isPending}>
          {submitLabel}
        </Button>
      </form>
    </Form>
  );
}
