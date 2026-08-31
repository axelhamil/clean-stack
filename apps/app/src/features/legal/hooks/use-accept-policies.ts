import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { toastError, toastSuccess } from "../../../shared/api/errors/toast";
import { acceptPoliciesMutationOptions } from "../../../shared/api/mutations/accept-policies";
import { policiesQueryOptions } from "../../../shared/api/queries/policies";

export function useAcceptPolicies(redirect?: string) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { t } = useTranslation("common");

  return useMutation({
    ...acceptPoliciesMutationOptions,
    onSuccess: async () => {
      await queryClient.refetchQueries({ queryKey: policiesQueryOptions.queryKey });
      toastSuccess(t("policyAcceptance.acceptedToast"));
      void navigate({ to: redirect ?? "/dashboard" });
    },
    onError: (err) => toastError(err, t("policyAcceptance.acceptFailed")),
  });
}
