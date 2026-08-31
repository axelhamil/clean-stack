import { Badge } from "@packages/ui/components/ui/badge";
import { NavLink } from "@packages/ui/components/ui/nav-link";
import { TableCell, TableRow } from "@packages/ui/components/ui/table";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useFormatDate } from "../../../shared/i18n/use-format-date";
import {
  isPlatformRole,
  PLATFORM_ROLE_LABEL_KEYS,
  USER_STATUS_LABEL_KEYS,
} from "../admin-user-labels";
import type { AdminUserListItem } from "../api/admin-users.queries";

interface UserRowProps {
  item: AdminUserListItem;
}

export function UserRow({ item }: UserRowProps) {
  const formatDate = useFormatDate();
  const { t } = useTranslation(["admin", "common"]);
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
        {item.role ? (
          <Badge variant="secondary">
            {isPlatformRole(item.role) ? t(PLATFORM_ROLE_LABEL_KEYS[item.role]) : item.role}
          </Badge>
        ) : (
          <span>—</span>
        )}
      </TableCell>
      <TableCell>
        {item.banned ? (
          <Badge variant="destructive">{t(USER_STATUS_LABEL_KEYS.suspended)}</Badge>
        ) : (
          <Badge variant="outline">{t(USER_STATUS_LABEL_KEYS.active)}</Badge>
        )}
      </TableCell>
      <TableCell>{formatDate(item.createdAt)}</TableCell>
    </TableRow>
  );
}
