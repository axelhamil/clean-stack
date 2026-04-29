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
import { ShieldCheckIcon, ShieldOffIcon } from "lucide-react";
import { useState } from "react";
import { DisableTwoFactorForm } from "../_forms/disable-two-factor-form";
import { EnableTwoFactorForm } from "../_forms/enable-two-factor-form";

interface TwoFactorCardProps {
  enabled: boolean;
}

export function TwoFactorCard({ enabled }: TwoFactorCardProps) {
  const [open, setOpen] = useState(false);

  return (
    <Card>
      <CardHeader className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1.5">
          <CardTitle>Two-factor authentication</CardTitle>
          <CardDescription>
            Require a 6-digit code from your authenticator app on every sign-in.
          </CardDescription>
        </div>
        <Badge variant={enabled ? "default" : "secondary"}>
          {enabled ? "Enabled" : "Off"}
        </Badge>
      </CardHeader>
      <CardContent>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button variant={enabled ? "destructive" : "outline"}>
              {enabled ? <ShieldOffIcon /> : <ShieldCheckIcon />}
              {enabled ? "Disable" : "Enable"} two-factor
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {enabled ? "Disable" : "Enable"} two-factor
              </DialogTitle>
              <DialogDescription>
                {enabled
                  ? "You'll only need your password to sign in."
                  : "Set up an authenticator app and save your backup codes."}
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
