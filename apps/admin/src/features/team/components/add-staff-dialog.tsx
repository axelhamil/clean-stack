import type { StaffRole } from "@packages/access-control";
import { Button } from "@packages/ui/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@packages/ui/components/ui/dialog";
import { Input } from "@packages/ui/components/ui/input";
import { ListRow, ListRowButton } from "@packages/ui/components/ui/list-row";
import { TypographyMuted } from "@packages/ui/components/ui/typography";
import { toastError } from "@packages/web-kit/api/errors/toast";
import { errorFallback } from "@packages/web-kit/i18n/get-errors-t";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { usersInfiniteQueryOptions } from "../../../shared/api/queries/users";
import { useDebouncedFilter } from "../../../shared/hooks/use-debounced-filter";
import { setStaffRoleMutationOptions } from "../api/team.mutations";
import { RoleSelect } from "./role-select";

export interface AddStaffDialogProps {
  onAwaiting: (approvalId: string) => void;
}

export function AddStaffDialog({ onAwaiting }: AddStaffDialogProps) {
  const { t } = useTranslation(["admin", "common"]);
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [committed, setCommitted] = useState("");
  const [search, setSearch] = useDebouncedFilter(committed, setCommitted);
  const [selected, setSelected] = useState<{ id: string; email: string } | null>(null);
  const [role, setRole] = useState<StaffRole>("support");
  const term = committed.trim();
  const users = useInfiniteQuery({
    ...usersInfiniteQueryOptions({ search: term }),
    enabled: open && term.length > 0,
  });
  const matches = users.data?.pages.flatMap((page) => page.items) ?? [];

  const reset = (next: boolean) => {
    setOpen(next);
    if (next) return;

    setCommitted("");
    setSearch("");
    setSelected(null);
  };

  const add = useMutation({
    ...setStaffRoleMutationOptions,
    onSuccess: (approvalId) => {
      reset(false);
      if (approvalId) {
        onAwaiting(approvalId);
        toast.success(t("backOffice.awaiting.toast"));
        return;
      }

      toast.success(t("team.added"));
      void queryClient.invalidateQueries({ queryKey: ["admin", "staff"] });
    },
    onError: (err) => toastError(err, errorFallback("setStaffRole")),
  });

  return (
    <Dialog open={open} onOpenChange={reset}>
      <DialogTrigger asChild>
        <Button>{t("team.add")}</Button>
      </DialogTrigger>
      <DialogContent closeLabel={t("common:actions.close")}>
        <DialogHeader>
          <DialogTitle>{t("team.addTitle")}</DialogTitle>
          <DialogDescription>{t("team.addDescription")}</DialogDescription>
        </DialogHeader>

        <Input
          aria-label={t("team.searchLabel")}
          placeholder={t("team.searchLabel")}
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setSelected(null);
          }}
        />

        {term.length > 0 && users.isSuccess && matches.length === 0 && (
          <TypographyMuted>{t("team.noMatches")}</TypographyMuted>
        )}
        {users.isError && <TypographyMuted>{t("users.loadFailed")}</TypographyMuted>}

        {!selected && matches.length > 0 && (
          <ul className="flex max-h-64 flex-col gap-2 overflow-y-auto">
            {matches.map((user) => (
              <ListRow key={user.id}>
                <ListRowButton className="wrap-anywhere" onClick={() => setSelected(user)}>
                  {user.name || user.email}
                  {user.name && <TypographyMuted>{user.email}</TypographyMuted>}
                </ListRowButton>
              </ListRow>
            ))}
          </ul>
        )}

        {selected && (
          <div className="flex flex-col gap-3">
            <TypographyMuted className="wrap-anywhere">
              {t("team.addingPerson", { email: selected.email })}
            </TypographyMuted>
            <RoleSelect value={role} onChange={setRole} label={t("team.table.role")} />
          </div>
        )}

        <DialogFooter>
          <Button
            disabled={!selected || add.isPending}
            onClick={() => selected && add.mutate({ id: selected.id, role })}
          >
            {t("team.addConfirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
