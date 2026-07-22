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
          <AlertDialogTitle>Transfer ownership and leave</AlertDialogTitle>
          <AlertDialogDescription>
            You are the sole owner of <strong>{org.name}</strong>. Transfer ownership to another
            member before leaving.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="flex flex-col gap-2">
          <TypographyMuted>New owner</TypographyMuted>
          <Select value={selectedMemberId} onValueChange={setSelectedMemberId}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select a member..." />
            </SelectTrigger>
            <SelectContent>
              {candidates.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.user.name ?? m.user.email} (current role: {m.role})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={!selectedMemberId || isPending}
            onClick={() => {
              if (selectedMemberId) onConfirm(selectedMemberId);
            }}
          >
            Transfer and leave
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
