import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@packages/ui/components/ui/button";
import { Form } from "@packages/ui/components/ui/form";
import { FormTextField } from "@packages/ui/components/ui/form-text-field";
import { useForm } from "react-hook-form";
import { type UpdateProfileInput, updateProfileSchema } from "../account.schema";
import { UploadAvatar } from "../components/upload-avatar";
import { useUpdateProfile } from "../hooks/use-update-profile";

interface UpdateProfileFormProps {
  name: string;
}

export function UpdateProfileForm({ name }: UpdateProfileFormProps) {
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
        <UploadAvatar name={name} />
        <FormTextField control={form.control} name="name" label="Name" autoComplete="name" />
        <Button type="submit" className="w-fit" disabled={mutation.isPending}>
          {mutation.isPending ? "Saving…" : "Save changes"}
        </Button>
      </form>
    </Form>
  );
}
