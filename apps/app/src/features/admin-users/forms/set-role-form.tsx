import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@packages/ui/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel } from "@packages/ui/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@packages/ui/components/ui/select";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import type { PlatformRole } from "../admin-user-labels";
import { type SetRoleFormInput, setRoleFormSchema } from "../admin-users.schema";

// Module-level values stay module-level (recipe shape 4) — only the labels
// move into a hook, since `t` doesn't exist outside a component.
function useRoleOptions() {
  const { t } = useTranslation("admin");
  return [
    { label: t("users.detail.roleOptionUser"), value: "user" },
    { label: t("users.detail.roleOptionAdmin"), value: "admin" },
  ] as const;
}

interface SetRoleFormProps {
  currentRole: PlatformRole;
  isPending: boolean;
  onSubmit: (values: SetRoleFormInput) => void;
}

export function SetRoleForm({ currentRole, isPending, onSubmit }: SetRoleFormProps) {
  const { t } = useTranslation("admin");
  const roleOptions = useRoleOptions();
  const form = useForm<SetRoleFormInput>({
    resolver: zodResolver(setRoleFormSchema),
    mode: "onChange",
    defaultValues: { role: currentRole },
  });

  const role = form.watch("role");

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
        <FormField
          control={form.control}
          name="role"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("users.table.role")}</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {roleOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormItem>
          )}
        />
        <Button type="submit" disabled={role === currentRole || isPending}>
          {t("users.detail.changeRoleSubmit")}
        </Button>
      </form>
    </Form>
  );
}
