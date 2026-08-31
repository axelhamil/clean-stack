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
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { toastError } from "../../../shared/api/errors/toast";
import { inviteMemberMutationOptions } from "../../../shared/api/mutations/invite-member";
import { orgInvitationsQueryOptions } from "../../../shared/api/queries/org-invitations";
import {
  type InviteMemberInput,
  inviteMemberSchema,
} from "../../../shared/auth/organization.schema";
import { ROLE_LABEL_KEYS } from "../role-labels";

export interface InviteMemberFormProps {
  organizationId: string;
}

export function InviteMemberForm({ organizationId }: InviteMemberFormProps) {
  const { t } = useTranslation(["settings", "common"]);
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
      toast.success(t("organization.invitationSentToast", { email: variables.email }));
      form.reset();
    },
    onError: (err) => toastError(err, t("organization.sendInvitationFailed")),
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
              <FormLabel>{t("organization.emailLabel")}</FormLabel>
              <FormControl>
                <Input type="email" placeholder={t("organization.emailPlaceholder")} {...field} />
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
              <FormLabel>{t("organization.roleLabel")}</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="member">{t(`common:${ROLE_LABEL_KEYS.member}`)}</SelectItem>
                  <SelectItem value="admin">{t(`common:${ROLE_LABEL_KEYS.admin}`)}</SelectItem>
                  <SelectItem value="owner">{t(`common:${ROLE_LABEL_KEYS.owner}`)}</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" disabled={invite.isPending}>
          {t("organization.sendInvitationAction")}
        </Button>
      </form>
    </Form>
  );
}
