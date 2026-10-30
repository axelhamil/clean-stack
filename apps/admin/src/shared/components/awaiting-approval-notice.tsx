import { Alert, AlertDescription } from "@packages/ui/components/ui/alert";
import { Button } from "@packages/ui/components/ui/button";
import { TextLink } from "@packages/ui/components/ui/text-link";
import { toastError } from "@packages/web-kit/api/errors/toast";
import { errorFallback } from "@packages/web-kit/i18n/get-errors-t";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { cancelApprovalMutationOptions } from "../api/mutations/cancel-approval";
import { useStaff } from "../auth/use-staff";

export interface AwaitingApprovalNoticeProps {
  approvalId: string;
  onClosed: () => void;
}

export function AwaitingApprovalNotice({ approvalId, onClosed }: AwaitingApprovalNoticeProps) {
  const { t } = useTranslation("admin");
  const { can } = useStaff();
  const queryClient = useQueryClient();
  const cancel = useMutation({
    ...cancelApprovalMutationOptions,
    onSuccess: () => {
      toast.success(t("backOffice.awaiting.cancelled"));
      void queryClient.invalidateQueries({ queryKey: ["admin", "approvals"] });
      onClosed();
    },
    onError: (err) => toastError(err, errorFallback("cancelApproval")),
  });

  return (
    <Alert>
      <AlertDescription className="gap-2">
        {t("backOffice.awaiting.message")}
        <span className="flex flex-wrap items-center gap-3">
          {can("approvals.decide") && (
            <TextLink asChild>
              <Link to="/approvals/$id" params={{ id: approvalId }}>
                {t("backOffice.awaiting.open")}
              </Link>
            </TextLink>
          )}
          <Button
            variant="outline"
            size="sm"
            disabled={cancel.isPending}
            onClick={() => cancel.mutate(approvalId)}
          >
            {t("backOffice.awaiting.cancel")}
          </Button>
        </span>
      </AlertDescription>
    </Alert>
  );
}
