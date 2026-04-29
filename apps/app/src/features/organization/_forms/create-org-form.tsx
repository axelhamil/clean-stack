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
import { useNavigate } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { broadcastAuthChange } from "../../../adapters/auth-broadcast";
import { createOrgMutationOptions } from "../../../adapters/mutations/create-org";
import { setActiveOrgMutationOptions } from "../../../adapters/mutations/set-active-org";
import { orgsListQueryOptions } from "../../../adapters/queries/orgs-list";
import { type CreateOrgInput, createOrgSchema } from "../_schemas/organization.schema";

export interface CreateOrgFormProps {
  onSuccess?: () => void;
}

export function CreateOrgForm({ onSuccess }: CreateOrgFormProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const create = useMutation(createOrgMutationOptions);
  const setActive = useMutation(setActiveOrgMutationOptions);

  const form = useForm<CreateOrgInput>({
    resolver: zodResolver(createOrgSchema),
    defaultValues: { name: "", slug: "" },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const org = await create.mutateAsync(values);
      await setActive.mutateAsync({ organizationId: org.id });
      await queryClient.refetchQueries({ queryKey: orgsListQueryOptions.queryKey });
      broadcastAuthChange();
      toast.success("Organization created");
      onSuccess?.();
      void navigate({ to: "/dashboard" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create organization");
    }
  });

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
                <Input placeholder="Acme" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="slug"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Slug</FormLabel>
              <FormControl>
                <Input placeholder="acme" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" disabled={create.isPending || setActive.isPending}>
          Create organization
        </Button>
      </form>
    </Form>
  );
}
