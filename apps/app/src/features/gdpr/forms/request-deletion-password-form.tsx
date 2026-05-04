import { zodResolver } from "@hookform/resolvers/zod";
import {
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogFooter,
} from "@packages/ui/components/ui/alert-dialog";
import { Form } from "@packages/ui/components/ui/form";
import { FormTextField } from "@packages/ui/components/ui/form-text-field";
import { useForm } from "react-hook-form";
import {
  type RequestDeletionWithPasswordInput,
  requestDeletionWithPasswordSchema,
} from "../gdpr.schema";
import { buildDeletionOnError } from "../hooks/build-deletion-on-error";
import { useRequestDeletion } from "../hooks/use-request-deletion";

interface RequestDeletionPasswordFormProps {
  onClose: () => void;
}

export function RequestDeletionPasswordForm({ onClose }: RequestDeletionPasswordFormProps) {
  const mutation = useRequestDeletion({ onClose });
  const form = useForm<RequestDeletionWithPasswordInput>({
    resolver: zodResolver(requestDeletionWithPasswordSchema),
    defaultValues: { password: "" },
  });

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit((values) =>
          mutation.mutate(values, {
            onError: buildDeletionOnError(onClose, "ACCOUNT_PASSWORD_INVALID", (msg) =>
              form.setError("password", { message: msg }),
            ),
          }),
        )}
        className="flex flex-col gap-4"
        noValidate
      >
        <FormTextField
          control={form.control}
          name="password"
          label="Confirm with your password"
          type="password"
          autoComplete="current-password"
          placeholder="••••••••"
        />
        <AlertDialogFooter>
          <AlertDialogCancel type="button">Cancel</AlertDialogCancel>
          <AlertDialogAction type="submit" variant="destructive" disabled={mutation.isPending}>
            {mutation.isPending ? "Submitting…" : "Delete account"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </form>
    </Form>
  );
}
