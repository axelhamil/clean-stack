import { Button } from "@packages/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@packages/ui/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@packages/ui/components/ui/dialog";
import { KeyRoundIcon } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ImpersonationReason } from "../../../shared/auth/impersonation-reason";
import { useImpersonationGuard } from "../../../shared/auth/use-impersonation-guard";
import { RegenerateBackupCodesForm } from "../forms/regenerate-backup-codes-form";

export function RecoveryCodesCard() {
  const { t } = useTranslation("settings");
  const [open, setOpen] = useState(false);
  const guard = useImpersonationGuard();

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("recoveryCodes.title")}</CardTitle>
        <CardDescription>{t("recoveryCodes.description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" disabled={guard.blocked} {...guard.describeProps()}>
              <KeyRoundIcon />
              {t("recoveryCodes.regenerate")}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("recoveryCodes.regenerateDialogTitle")}</DialogTitle>
              <DialogDescription>
                {t("recoveryCodes.regenerateDialogDescription")}
              </DialogDescription>
            </DialogHeader>
            <RegenerateBackupCodesForm onDone={() => setOpen(false)} />
          </DialogContent>
        </Dialog>
        <ImpersonationReason guard={guard} />
      </CardContent>
    </Card>
  );
}
