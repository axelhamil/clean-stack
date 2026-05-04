import { zodResolver } from "@hookform/resolvers/zod";
import {
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogFooter,
} from "@packages/ui/components/ui/alert-dialog";
import { Form } from "@packages/ui/components/ui/form";
import { FormTextField } from "@packages/ui/components/ui/form-text-field";
import { useForm } from "react-hook-form";
import { buildDeletionOnError } from "../build-deletion-on-error";
import { useRequestDeletion } from "../hooks/use-request-deletion";
import { type RequestDeletionWithTotpInput, requestDeletionWithTotpSchema } from "../rgpd.schema";

interface RequestDeletionTotpFormProps {
  onClose: () => void;
}

export function RequestDeletionTotpForm({ onClose }: RequestDeletionTotpFormProps) {
  const mutation = useRequestDeletion({ onClose });
  const form = useForm<RequestDeletionWithTotpInput>({
    resolver: zodResolver(requestDeletionWithTotpSchema),
    defaultValues: { totpCode: "" },
  });

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit((values) =>
          mutation.mutate(values, {
            onError: buildDeletionOnError(onClose, "TWO_FACTOR_INVALID", (msg) =>
              form.setError("totpCode", { message: msg }),
            ),
          }),
        )}
        className="flex flex-col gap-4"
        noValidate
      >
        <FormTextField
          control={form.control}
          name="totpCode"
          label="Confirm with your authenticator code"
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder="123456"
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
