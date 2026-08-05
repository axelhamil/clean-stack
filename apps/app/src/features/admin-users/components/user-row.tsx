import { Badge } from "@packages/ui/components/ui/badge";
import { Button } from "@packages/ui/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@packages/ui/components/ui/dropdown-menu";
import { NavLink } from "@packages/ui/components/ui/nav-link";
import { TableCell, TableRow } from "@packages/ui/components/ui/table";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { MoreHorizontal } from "lucide-react";
import { toast } from "sonner";
import {
  banUserMutationOptions,
  resetUserPasswordMutationOptions,
  revokeUserSessionsMutationOptions,
  setUserRoleMutationOptions,
  startImpersonationMutationOptions,
  unbanUserMutationOptions,
} from "../api/admin-users.mutations";
import type { AdminUserListItem } from "../api/admin-users.queries";

interface UserRowProps {
  item: AdminUserListItem;
}

export function UserRow({ item }: UserRowProps) {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["admin", "users"] });

  const ban = useMutation({
    ...banUserMutationOptions,
    onSuccess: () => {
      toast.success("Compte suspendu");
      void invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const unban = useMutation({
    ...unbanUserMutationOptions,
    onSuccess: () => {
      toast.success("Compte réactivé");
      void invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const setRole = useMutation({
    ...setUserRoleMutationOptions,
    onSuccess: () => {
      toast.success("Rôle mis à jour");
      void invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const resetPassword = useMutation({
    ...resetUserPasswordMutationOptions,
    onSuccess: () => toast.success("Email de réinitialisation envoyé"),
    onError: (err) => toast.error(err.message),
  });

  const revokeSessions = useMutation({
    ...revokeUserSessionsMutationOptions,
    onSuccess: () => toast.success("Sessions révoquées"),
    onError: (err) => toast.error(err.message),
  });

  const impersonate = useMutation({
    ...startImpersonationMutationOptions,
    onSuccess: () => toast.success("Impersonation démarrée"),
    onError: (err) => toast.error(err.message),
  });

  const nextRole = item.role === "admin" ? "user" : "admin";

  return (
    <TableRow>
      <TableCell>
        <NavLink asChild variant="plain">
          <a href={`/admin/users/${item.id}`}>{item.email}</a>
        </NavLink>
      </TableCell>
      <TableCell>{item.name}</TableCell>
      <TableCell>
        {item.role ? <Badge variant="secondary">{item.role}</Badge> : <span>—</span>}
      </TableCell>
      <TableCell>
        {item.banned ? (
          <Badge variant="destructive">Suspendu</Badge>
        ) : (
          <Badge variant="outline">Actif</Badge>
        )}
      </TableCell>
      <TableCell>{new Date(item.createdAt).toLocaleDateString("fr-FR")}</TableCell>
      <TableCell>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon">
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {item.banned ? (
              <DropdownMenuItem
                onClick={() => unban.mutate({ id: item.id })}
                disabled={unban.isPending}
              >
                Réactiver
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem
                onClick={() => ban.mutate({ id: item.id, reason: "Suspension manuelle" })}
                disabled={ban.isPending}
              >
                Suspendre
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              onClick={() => setRole.mutate({ id: item.id, role: nextRole })}
              disabled={setRole.isPending}
            >
              Passer en {nextRole}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => resetPassword.mutate({ id: item.id })}
              disabled={resetPassword.isPending}
            >
              Réinitialiser le mot de passe
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => revokeSessions.mutate({ id: item.id })}
              disabled={revokeSessions.isPending}
            >
              Révoquer les sessions
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() =>
                impersonate.mutate({ id: item.id, reason: "Assistance administrative" })
              }
              disabled={impersonate.isPending}
            >
              Impersonner
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );
}
