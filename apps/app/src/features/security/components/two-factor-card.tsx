import { Badge } from "@packages/ui/components/ui/badge";
import { Button } from "@packages/ui/components/ui/button";
import {
  Card,
  CardAction,
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
import { ShieldCheckIcon, ShieldOffIcon } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { DisableTwoFactorForm } from "../forms/disable-two-factor-form";
import { EnableTwoFactorForm } from "../forms/enable-two-factor-form";

interface TwoFactorCardProps {
  enabled: boolean;
}

export function TwoFactorCard({ enabled }: TwoFactorCardProps) {
  const { t } = useTranslation("settings");
  const [open, setOpen] = useState(false);
  const action = enabled ? t("twoFactor.disableAction") : t("twoFactor.enableAction");

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("twoFactor.title")}</CardTitle>
        <CardDescription>{t("twoFactor.description")}</CardDescription>
        <CardAction>
          <Badge variant={enabled ? "default" : "secondary"}>
            {enabled ? t("twoFactor.enabled") : t("twoFactor.off")}
          </Badge>
        </CardAction>
      </CardHeader>
      <CardContent>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button variant={enabled ? "destructive" : "outline"}>
              {enabled ? <ShieldOffIcon /> : <ShieldCheckIcon />}
              {action}
            </Button>
          </DialogTrigger>
          <DialogContent>
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
      </CardContent>
    </Card>
  );
}
