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
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ImpersonationReason } from "../../../shared/auth/impersonation-reason";
import { useImpersonationGuard } from "../../../shared/auth/use-impersonation-guard";
import { ChangePasswordForm } from "../forms/change-password-form";

export function ChangePasswordCard() {
  const { t } = useTranslation("settings");
  const [open, setOpen] = useState(false);
  const guard = useImpersonationGuard();

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("account.changePasswordTitle")}</CardTitle>
        <CardDescription>{t("account.changePasswordDescription")}</CardDescription>
      </CardHeader>
      <CardContent>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" disabled={guard.blocked} {...guard.describeProps()}>
              {t("account.changePasswordButton")}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("account.changePasswordDialogTitle")}</DialogTitle>
              <DialogDescription>{t("account.changePasswordDialogDescription")}</DialogDescription>
            </DialogHeader>
            <ChangePasswordForm onSuccess={() => setOpen(false)} />
          </DialogContent>
        </Dialog>
        <ImpersonationReason guard={guard} />
      </CardContent>
    </Card>
  );
}
