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
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { broadcastAuthChange } from "../../../adapters/auth-broadcast";
import { updateOrgMutationOptions } from "../../../adapters/mutations/update-org";
import { activeOrgQueryOptions } from "../../../adapters/queries/active-org";
import { orgsListQueryOptions } from "../../../adapters/queries/orgs-list";
import {
  type UpdateOrgInput,
  updateOrgSchema,
} from "../../../adapters/schemas/organization.schema";
import { toastError } from "../../../common/toast-error";

export interface UpdateOrgFormProps {
  organizationId: string;
  defaultValues: UpdateOrgInput;
}

export function UpdateOrgForm({ organizationId, defaultValues }: UpdateOrgFormProps) {
  const queryClient = useQueryClient();

  const form = useForm<UpdateOrgInput>({
    resolver: zodResolver(updateOrgSchema),
    defaultValues,
  });

  const update = useMutation({
    ...updateOrgMutationOptions,
    onSuccess: async () => {
      await Promise.all([
        queryClient.refetchQueries({ queryKey: activeOrgQueryOptions.queryKey }),
        queryClient.refetchQueries({ queryKey: orgsListQueryOptions.queryKey }),
      ]);
      broadcastAuthChange();
      toast.success("Organization updated");
    },
    onError: (err) => toastError(err, "Failed to update organization"),
  });

  const onSubmit = form.handleSubmit((values) => update.mutate({ organizationId, ...values }));

  return (
    <Form {...form}>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Name</FormLabel>
              <FormControl>
                <Input {...field} value={field.value ?? ""} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" disabled={update.isPending}>
          Save changes
        </Button>
      </form>
    </Form>
  );
}
