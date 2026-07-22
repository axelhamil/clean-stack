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
import { RegenerateBackupCodesForm } from "../forms/regenerate-backup-codes-form";

export function RecoveryCodesCard() {
  const [open, setOpen] = useState(false);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recovery codes</CardTitle>
        <CardDescription>
          One-time codes to sign in if you lose access to your authenticator app.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button variant="outline">
              <KeyRoundIcon />
              Regenerate codes
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Regenerate recovery codes</DialogTitle>
              <DialogDescription>
                You'll get a fresh set of one-time codes. Previous codes stop working immediately.
              </DialogDescription>
            </DialogHeader>
            <RegenerateBackupCodesForm onDone={() => setOpen(false)} />
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
