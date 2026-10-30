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
import { KeyRoundIcon } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { GuardHint } from "../../../shared/auth/guard-hint";
import { ImpersonationReason } from "../../../shared/auth/impersonation-reason";
import { useImpersonationGuard } from "../../../shared/auth/use-impersonation-guard";
import { RegenerateBackupCodesForm } from "../forms/regenerate-backup-codes-form";

export function RecoveryCodesCard() {
  const { t } = useTranslation("settings");
  const { t: tCommon } = useTranslation("common");
  const [open, setOpen] = useState(false);
  const guard = useImpersonationGuard();

  return (
    <SettingsSection title={t("recoveryCodes.title")} description={t("recoveryCodes.description")}>
      <Dialog open={open} onOpenChange={setOpen}>
        <GuardHint guard={guard} className="self-start">
          <DialogTrigger asChild>
            <Button
              variant="outline"
              className="self-start"
              disabled={guard.blocked}
              {...guard.describeProps()}
            >
              <KeyRoundIcon />
              {t("recoveryCodes.regenerate")}
            </Button>
          </DialogTrigger>
        </GuardHint>
        <DialogContent closeLabel={tCommon("actions.close")}>
          <DialogHeader>
            <DialogTitle>{t("recoveryCodes.regenerateDialogTitle")}</DialogTitle>
            <DialogDescription>{t("recoveryCodes.regenerateDialogDescription")}</DialogDescription>
          </DialogHeader>
          <RegenerateBackupCodesForm onDone={() => setOpen(false)} />
        </DialogContent>
      </Dialog>
      <ImpersonationReason guard={guard} />
    </SettingsSection>
  );
}
