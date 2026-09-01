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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@packages/ui/components/ui/select";
import { Textarea } from "@packages/ui/components/ui/textarea";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { type BanFormInput, banFormSchema } from "../admin-users.schema";

// Module-level values stay module-level (recipe shape 4) — only the labels
// move into a hook, since `t` doesn't exist outside a component.
function useDurationOptions() {
  const { t } = useTranslation("admin");
  return [
    { label: t("users.banForm.duration24h"), value: String(86400) },
    { label: t("users.banForm.duration7d"), value: String(604800) },
    { label: t("users.banForm.duration30d"), value: String(2592000) },
    { label: t("users.durationPermanent"), value: "permanent" },
  ] as const;
}

interface BanFormProps {
  isPending: boolean;
  onSubmit: (values: BanFormInput) => void;
}

export function BanForm({ isPending, onSubmit }: BanFormProps) {
  const { t } = useTranslation("admin");
  const durationOptions = useDurationOptions();
  const form = useForm<BanFormInput>({
    resolver: zodResolver(banFormSchema),
    mode: "onChange",
    defaultValues: { reason: "", expiresIn: undefined },
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
              <FormLabel>{t("users.banForm.reasonLabel")}</FormLabel>
              <FormControl>
                <Textarea placeholder={t("users.banForm.reasonPlaceholder")} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="expiresIn"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("users.banForm.durationLabel")}</FormLabel>
              <Select
                value={field.value !== undefined ? String(field.value) : "permanent"}
                onValueChange={(v) => field.onChange(v === "permanent" ? undefined : Number(v))}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {durationOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" variant="destructive" disabled={!reason.trim() || isPending}>
          {t("users.suspendAccountTitle")}
        </Button>
      </form>
    </Form>
  );
}
