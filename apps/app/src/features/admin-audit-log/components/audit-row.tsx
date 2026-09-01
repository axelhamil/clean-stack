import { Badge } from "@packages/ui/components/ui/badge";
import { Button } from "@packages/ui/components/ui/button";
import { TableCell, TableRow } from "@packages/ui/components/ui/table";
import { useTranslation } from "react-i18next";
import { useFormatDateTime } from "../../../shared/i18n/use-format-date";
import type { AuditRow } from "../api/audit-log.queries";
import { AUDIT_ACTOR_TYPE_LABEL_KEYS } from "../audit-actor-type-labels";

interface AuditRowProps {
  row: AuditRow;
  onSelect: (row: AuditRow) => void;
}

export function AuditTableRow({ row, onSelect }: AuditRowProps) {
  const { t } = useTranslation("admin");
  // Occurred-at is the audit trail's ordering key — same-day events must stay
  // distinguishable, so this uses date+time precision rather than the
  // date-only `useFormatDate`.
  const formatDateTime = useFormatDateTime();

  return (
    <TableRow>
      <TableCell>{formatDateTime(row.occurredAt)}</TableCell>
      <TableCell>
        <Badge variant="secondary">{t(AUDIT_ACTOR_TYPE_LABEL_KEYS[row.actorType])}</Badge>
      </TableCell>
      <TableCell>
        <Badge variant="outline">{row.action}</Badge>
      </TableCell>
      <TableCell>
        {row.targetType} / {row.targetId}
      </TableCell>
      <TableCell>{row.organizationId ?? "—"}</TableCell>
      <TableCell>
        <Button variant="ghost" size="sm" onClick={() => onSelect(row)}>
          {t("auditLog.detailsAction")}
        </Button>
      </TableCell>
    </TableRow>
  );
}
