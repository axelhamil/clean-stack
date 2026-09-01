import { Badge } from "@packages/ui/components/ui/badge";
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
import { TypographyMuted } from "@packages/ui/components/ui/typography";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ImpersonationReason } from "../../../shared/auth/impersonation-reason";
import { useImpersonationGuard } from "../../../shared/auth/use-impersonation-guard";
import { ChangeEmailForm } from "../forms/change-email-form";
import { UpdateProfileForm } from "../forms/update-profile-form";

interface ProfileCardProps {
  name: string;
  email: string;
  pendingEmail?: string | null;
}

export function ProfileCard({ name, email, pendingEmail }: ProfileCardProps) {
  const { t } = useTranslation("settings");
  const [open, setOpen] = useState(false);
  // `/update-user` and `/change-email` are both on the BetterAuth
  // impersonation blocklist (apps/api/src/shared/middleware/impersonation-blocklist.ts),
  // so every control on this card would 403 at click time.
  const guard = useImpersonationGuard();

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("account.profileTitle")}</CardTitle>
        <CardDescription>{t("account.profileDescription")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <UpdateProfileForm name={name} guard={guard} />
        <div className="flex items-center justify-between gap-4">
          <div className="flex flex-col items-start gap-1">
            <TypographyMuted>{t("account.emailLabel")}</TypographyMuted>
            <span>{email}</span>
            {pendingEmail ? (
              <Badge variant="secondary">
                {t("account.pendingEmailChange", { email: pendingEmail })}
              </Badge>
            ) : null}
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                disabled={guard.blocked}
                {...guard.describeProps()}
              >
                {t("account.changeEmail")}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t("account.changeEmailDialogTitle")}</DialogTitle>
                <DialogDescription>{t("account.changeEmailDialogDescription")}</DialogDescription>
              </DialogHeader>
              <ChangeEmailForm onSuccess={() => setOpen(false)} />
            </DialogContent>
          </Dialog>
        </div>
        <ImpersonationReason guard={guard} />
      </CardContent>
    </Card>
  );
}
