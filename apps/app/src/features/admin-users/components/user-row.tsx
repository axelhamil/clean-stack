import { Badge } from "@packages/ui/components/ui/badge";
import { NavLink } from "@packages/ui/components/ui/nav-link";
import { TableCell, TableRow } from "@packages/ui/components/ui/table";
import { Link } from "@tanstack/react-router";
import type { AdminUserListItem } from "../api/admin-users.queries";

interface UserRowProps {
  item: AdminUserListItem;
}

export function UserRow({ item }: UserRowProps) {
  return (
    <TableRow>
      <TableCell>
        <NavLink asChild variant="plain">
          <Link to="/admin/users/$id" params={{ id: item.id }}>
            {item.email}
          </Link>
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
    </TableRow>
  );
}
