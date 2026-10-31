import { Badge } from "@packages/ui/components/ui/badge";
import { Switch } from "@packages/ui/components/ui/switch";
import { toastError } from "@packages/web-kit/api/errors/toast";
import { errorFallback } from "@packages/web-kit/i18n/get-errors-t";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useStaff } from "../../../shared/auth/use-staff";
import { setSsoEnforcementMutationOptions } from "../api/orgs.mutations";

export interface SsoEnforcementSwitchProps {
  org: { id: string; name: string; ssoEnforced: boolean };
}

export function SsoEnforcementSwitch({ org }: SsoEnforcementSwitchProps) {
  const { t } = useTranslation("admin");
  const { can } = useStaff();
  const queryClient = useQueryClient();
  const mutation = useMutation({
    ...setSsoEnforcementMutationOptions,
    onSuccess: () => {
      toast.success(t("orgs.ssoEnforcementUpdatedToast"));
      void queryClient.invalidateQueries({ queryKey: ["admin", "orgs"] });
    },
    onError: (err) => toastError(err, errorFallback("updateAdminOrgSsoEnforcement")),
  });

  if (!can("orgs.sso")) {
    return (
      <Badge variant={org.ssoEnforced ? "secondary" : "outline"}>
        {t(org.ssoEnforced ? "orgs.ssoOn" : "orgs.ssoOff")}
      </Badge>
    );
  }

  return (
    <Switch
      aria-label={t("orgs.ssoEnforcedAriaLabel", { name: org.name })}
      checked={org.ssoEnforced}
      disabled={mutation.isPending}
      onCheckedChange={(enforced) => mutation.mutate({ id: org.id, enforced })}
    />
  );
}
