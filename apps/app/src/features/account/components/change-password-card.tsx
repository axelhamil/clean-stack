import { Button } from "@packages/ui/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@packages/ui/components/ui/dialog";
import { SettingsSection } from "@packages/ui/components/ui/settings-section";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { GuardHint } from "../../../shared/auth/guard-hint";
import { ImpersonationReason } from "../../../shared/auth/impersonation-reason";
import { useImpersonationGuard } from "../../../shared/auth/use-impersonation-guard";
import { ChangePasswordForm } from "../forms/change-password-form";

export function ChangePasswordCard() {
  const { t } = useTranslation("settings");
  const { t: tCommon } = useTranslation("common");
  const [open, setOpen] = useState(false);
  const guard = useImpersonationGuard();

  return (
    <SettingsSection
      title={t("account.changePasswordTitle")}
      description={t("account.changePasswordDescription")}
    >
      <Dialog open={open} onOpenChange={setOpen}>
        <GuardHint guard={guard} className="self-start">
          <DialogTrigger asChild>
            <Button
              variant="outline"
              className="self-start"
              disabled={guard.blocked}
              {...guard.describeProps()}
            >
              {t("account.changePasswordButton")}
            </Button>
          </DialogTrigger>
        </GuardHint>
        <DialogContent closeLabel={tCommon("actions.close")}>
          <DialogHeader>
            <DialogTitle>{t("account.changePasswordDialogTitle")}</DialogTitle>
            <DialogDescription>{t("account.changePasswordDialogDescription")}</DialogDescription>
          </DialogHeader>
          <ChangePasswordForm onSuccess={() => setOpen(false)} />
        </DialogContent>
      </Dialog>
      <ImpersonationReason guard={guard} />
    </SettingsSection>
  );
}
