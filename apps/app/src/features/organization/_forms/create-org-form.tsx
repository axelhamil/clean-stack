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
import { toast } from "sonner";
import { useSetActiveOrg } from "../../../adapters/hooks/use-set-active-org";
import { createOrgMutationOptions } from "../../../adapters/mutations/create-org";
import {
  type CreateOrgInput,
  createOrgSchema,
} from "../../../adapters/schemas/organization.schema";
import { toastError } from "../../../common/toast-error";

export interface CreateOrgFormProps {
  onSuccess?: () => void;
}

export function CreateOrgForm({ onSuccess }: CreateOrgFormProps) {
  const navigate = useNavigate();
  const { switchOrg, isPending: isSwitching } = useSetActiveOrg();
  const create = useMutation({
    ...createOrgMutationOptions,
    onSuccess: async (org) => {
      await switchOrg(org.id);
      toast.success("Organization created");
      onSuccess?.();
      void navigate({ to: "/dashboard" });
    },
    onError: (err) => toastError(err, "Failed to create organization"),
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
              <FormLabel>Name</FormLabel>
              <FormControl>
                <Input placeholder="Acme" autoFocus {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" disabled={create.isPending || isSwitching}>
          Create organization
        </Button>
      </form>
    </Form>
  );
}
