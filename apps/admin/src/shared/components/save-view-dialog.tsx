import { Button } from "@packages/ui/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@packages/ui/components/ui/dialog";
import { Input } from "@packages/ui/components/ui/input";
import { Label } from "@packages/ui/components/ui/label";
import { type FormEvent, useId, useState } from "react";
import { useTranslation } from "react-i18next";

export interface SaveViewDialogProps {
  isPending: boolean;
  onSave: (name: string, close: () => void) => void;
}

export function SaveViewDialog({ isPending, onSave }: SaveViewDialogProps) {
  const { t } = useTranslation(["admin", "common"]);
  const nameId = useId();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");

  const submit = (event: FormEvent) => {
    event.preventDefault();
    onSave(name.trim(), () => {
      setOpen(false);
      setName("");
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          {t("backOffice.views.save")}
        </Button>
      </DialogTrigger>
      <DialogContent closeLabel={t("common:actions.close")}>
        <DialogHeader>
          <DialogTitle>{t("backOffice.views.dialogTitle")}</DialogTitle>
          <DialogDescription>{t("backOffice.views.dialogDescription")}</DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-3" onSubmit={submit}>
          <div className="flex flex-col gap-2">
            <Label htmlFor={nameId}>{t("backOffice.views.nameLabel")}</Label>
            <Input
              id={nameId}
              maxLength={80}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <Button
            type="submit"
            className="self-start"
            disabled={isPending || name.trim().length === 0}
          >
            {t("backOffice.views.confirm")}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
