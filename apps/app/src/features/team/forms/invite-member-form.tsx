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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@packages/ui/components/ui/select";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { inviteMemberMutationOptions } from "../../../shared/api/mutations/invite-member";
import { orgInvitationsQueryOptions } from "../../../shared/api/queries/org-invitations";
import {
  type InviteMemberInput,
  inviteMemberSchema,
} from "../../../shared/auth/organization.schema";
import { toastError } from "../../../shared/utils";

export interface InviteMemberFormProps {
  organizationId: string;
}

export function InviteMemberForm({ organizationId }: InviteMemberFormProps) {
  const queryClient = useQueryClient();

  const form = useForm<InviteMemberInput>({
    resolver: zodResolver(inviteMemberSchema),
    defaultValues: { email: "", role: "member" },
  });

  const invite = useMutation({
    ...inviteMemberMutationOptions,
    onSuccess: async (_data, variables) => {
      await queryClient.refetchQueries({
        queryKey: orgInvitationsQueryOptions(organizationId).queryKey,
      });
      toast.success(`Invitation sent to ${variables.email}`);
      form.reset();
    },
    onError: (err) => toastError(err, "Failed to send invitation"),
  });

  const onSubmit = form.handleSubmit((values) => invite.mutate({ ...values, organizationId }));

  return (
    <Form {...form}>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input type="email" placeholder="teammate@example.com" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="role"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Role</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="member">Member</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="owner">Owner</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" disabled={invite.isPending}>
          Send invitation
        </Button>
      </form>
    </Form>
  );
}
