import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@packages/ui/components/ui/button";
import { Form } from "@packages/ui/components/ui/form";
import { FormTextField } from "@packages/ui/components/ui/form-text-field";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import type { ImpersonationGuard } from "../../../shared/auth/use-impersonation-guard";
import { type UpdateProfileInput, updateProfileSchema } from "../account.schema";
import { UploadAvatar } from "../components/upload-avatar";
import { useUpdateProfile } from "../hooks/use-update-profile";

interface UpdateProfileFormProps {
  name: string;
  guard: ImpersonationGuard;
}

export function UpdateProfileForm({ name, guard }: UpdateProfileFormProps) {
  const { t } = useTranslation("settings");
  const mutation = useUpdateProfile();
  const form = useForm<UpdateProfileInput>({
    resolver: zodResolver(updateProfileSchema),
    defaultValues: { name },
  });

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
        className="flex flex-col gap-4"
        noValidate
      >
        <UploadAvatar name={name} guard={guard} />
        <FormTextField
          control={form.control}
          name="name"
          label={t("account.nameLabel")}
          autoComplete="name"
        />
        <Button
          type="submit"
          className="w-fit"
          disabled={mutation.isPending || guard.blocked}
          {...guard.describeProps(mutation.isPending)}
        >
          {mutation.isPending ? t("account.saving") : t("account.saveChanges")}
        </Button>
      </form>
    </Form>
  );
}
