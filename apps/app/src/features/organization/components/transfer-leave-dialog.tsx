import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@packages/ui/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@packages/ui/components/ui/select";
import { TypographyMuted } from "@packages/ui/components/ui/typography";
import type { ReactElement } from "react";
import { useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { isOrgRole, ROLE_LABEL_KEYS } from "../role-labels";

interface TransferLeaveDialogProps {
  org: { id: string; name: string };
  members: ReadonlyArray<{
    id: string;
    role: string;
    user: { id: string; email: string; name: string | null };
  }>;
  currentUserId: string;
  isPending: boolean;
  onConfirm: (newOwnerMemberId: string) => void;
  trigger: ReactElement;
}

export function TransferLeaveDialog({
  org,
  members,
  currentUserId,
  isPending,
  onConfirm,
  trigger,
}: TransferLeaveDialogProps) {
  const { t } = useTranslation(["settings", "common"]);
  const [selectedMemberId, setSelectedMemberId] = useState<string | undefined>(undefined);
  const [open, setOpen] = useState(false);

  const candidates = members.filter((m) => m.user.id !== currentUserId);

  const handleOpenChange = (next: boolean) => {
    if (!next) setSelectedMemberId(undefined);
    setOpen(next);
  };

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("organization.transferDialogTitle")}</AlertDialogTitle>
          <AlertDialogDescription>
            <Trans
              ns="settings"
              i18nKey="organization.transferDialogDescription"
              components={{ orgName: <strong>{org.name}</strong> }}
            />
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="flex flex-col gap-2">
          <TypographyMuted>{t("organization.newOwnerLabel")}</TypographyMuted>
          <Select value={selectedMemberId} onValueChange={setSelectedMemberId}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder={t("organization.selectMemberPlaceholder")} />
            </SelectTrigger>
            <SelectContent>
              {candidates.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.user.name ?? m.user.email}{" "}
                  {t("organization.currentRoleSuffix", {
                    role: isOrgRole(m.role) ? t(`common:${ROLE_LABEL_KEYS[m.role]}`) : m.role,
                  })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("common:actions.cancel")}</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={!selectedMemberId || isPending}
            onClick={() => {
              if (selectedMemberId) onConfirm(selectedMemberId);
            }}
          >
            {t("organization.transferAndLeaveAction")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
