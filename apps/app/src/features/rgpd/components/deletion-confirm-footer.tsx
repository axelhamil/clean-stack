import {
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogFooter,
} from "@packages/ui/components/ui/alert-dialog";
import { useTranslation } from "react-i18next";
import { ImpersonationReason } from "../../../shared/auth/impersonation-reason";
import { useImpersonationGuard } from "../../../shared/auth/use-impersonation-guard";

interface DeletionConfirmFooterProps {
  isPending: boolean;
}

export function DeletionConfirmFooter({ isPending }: DeletionConfirmFooterProps) {
  const { t } = useTranslation(["settings", "common"]);
  const guard = useImpersonationGuard();

  return (
    <>
      <AlertDialogFooter>
        <AlertDialogCancel type="button">{t("common:actions.cancel")}</AlertDialogCancel>
        <AlertDialogAction
          type="submit"
          variant="destructive"
          disabled={isPending || guard.blocked}
          {...guard.describeProps(isPending)}
        >
          {isPending ? t("deletion.submitting") : t("deletion.confirm")}
        </AlertDialogAction>
      </AlertDialogFooter>
      <ImpersonationReason guard={guard} />
    </>
  );
}
