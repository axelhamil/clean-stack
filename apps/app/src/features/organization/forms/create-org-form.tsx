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
import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { toastError } from "../../../shared/api/errors/toast";
import { createOrgMutationOptions } from "../../../shared/api/mutations/create-org";
import { type CreateOrgInput, createOrgSchema } from "../../../shared/auth/organization.schema";
import { useSetActiveOrg } from "../../../shared/auth/use-set-active-org";

export interface CreateOrgFormProps {
  onSuccess?: () => void;
}

export function CreateOrgForm({ onSuccess }: CreateOrgFormProps) {
  const { t } = useTranslation("common");
  const navigate = useNavigate();
  const { switchOrg, isPending: isSwitching } = useSetActiveOrg();
  const create = useMutation({
    ...createOrgMutationOptions,
    onSuccess: async (org) => {
      await switchOrg(org.id);
      toast.success(t("orgNew.createdToast"));
      onSuccess?.();
      void navigate({ to: "/dashboard" });
    },
    onError: (err) => toastError(err, t("orgNew.createFailed")),
  });

  const form = useForm<CreateOrgInput>({
    resolver: zodResolver(createOrgSchema),
    defaultValues: { name: "" },
  });

  const onSubmit = form.handleSubmit((values) => create.mutate(values));

  return (
    <Form {...form}>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("orgNew.nameLabel")}</FormLabel>
              <FormControl>
                <Input placeholder={t("orgNew.namePlaceholder")} autoFocus {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" disabled={create.isPending || isSwitching}>
          {t("orgNew.title")}
        </Button>
      </form>
    </Form>
  );
}
