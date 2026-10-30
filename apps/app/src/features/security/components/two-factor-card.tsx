import { Badge } from "@packages/ui/components/ui/badge";
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
import { ShieldCheckIcon, ShieldOffIcon } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ImpersonationReason } from "../../../shared/auth/impersonation-reason";
import { useImpersonationGuard } from "../../../shared/auth/use-impersonation-guard";
import { DisableTwoFactorForm } from "../forms/disable-two-factor-form";
import { EnableTwoFactorForm } from "../forms/enable-two-factor-form";

interface TwoFactorCardProps {
  enabled: boolean;
}

export function TwoFactorCard({ enabled }: TwoFactorCardProps) {
  const { t } = useTranslation("settings");
  const { t: tCommon } = useTranslation("common");
  const [open, setOpen] = useState(false);
  const guard = useImpersonationGuard();
  const action = enabled ? t("twoFactor.disableAction") : t("twoFactor.enableAction");

  return (
    <SettingsSection title={t("twoFactor.title")} description={t("twoFactor.description")}>
      <div className="flex flex-wrap items-center gap-3">
        <Badge variant={enabled ? "default" : "secondary"}>
          {enabled ? t("twoFactor.enabled") : t("twoFactor.off")}
        </Badge>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" disabled={guard.blocked} {...guard.describeProps()}>
              {enabled ? <ShieldOffIcon /> : <ShieldCheckIcon />}
              {action}
            </Button>
          </DialogTrigger>
          <DialogContent closeLabel={tCommon("actions.close")}>
            <DialogHeader>
              <DialogTitle>{action}</DialogTitle>
              <DialogDescription>
                {enabled
                  ? t("twoFactor.disableDialogDescription")
                  : t("twoFactor.enableDialogDescription")}
              </DialogDescription>
            </DialogHeader>
            {enabled ? (
              <DisableTwoFactorForm onSuccess={() => setOpen(false)} />
            ) : (
              <EnableTwoFactorForm onSuccess={() => setOpen(false)} />
            )}
          </DialogContent>
        </Dialog>
      </div>
      <ImpersonationReason guard={guard} />
    </SettingsSection>
  );
}
