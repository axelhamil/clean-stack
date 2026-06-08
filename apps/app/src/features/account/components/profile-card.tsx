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
import { ChangeEmailForm } from "../forms/change-email-form";
import { UpdateProfileForm } from "../forms/update-profile-form";

interface ProfileCardProps {
  name: string;
  email: string;
  pendingEmail?: string | null;
}

export function ProfileCard({ name, email, pendingEmail }: ProfileCardProps) {
  const [open, setOpen] = useState(false);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Profile</CardTitle>
        <CardDescription>Your personal information.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <UpdateProfileForm name={name} />
        <div className="flex items-center justify-between gap-4">
          <div className="flex flex-col items-start gap-1">
            <TypographyMuted>Email</TypographyMuted>
            <span>{email}</span>
            {pendingEmail ? (
              <Badge variant="secondary">Pending change to {pendingEmail}</Badge>
            ) : null}
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                Change email
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Change email address</DialogTitle>
                <DialogDescription>
                  A confirmation link will be sent to your current address. Your email changes only
                  after you click the link.
                </DialogDescription>
              </DialogHeader>
              <ChangeEmailForm onSuccess={() => setOpen(false)} />
            </DialogContent>
          </Dialog>
        </div>
      </CardContent>
    </Card>
  );
}
