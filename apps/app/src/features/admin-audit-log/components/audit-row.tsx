import { Button } from "@packages/ui/components/ui/button";
import { TableCell, TableRow } from "@packages/ui/components/ui/table";
import { TypographyInline } from "@packages/ui/components/ui/typography";
import { useFormatDateTime } from "@packages/web-kit/i18n/use-format-date";
import { useTranslation } from "react-i18next";
import { EMPTY_VALUE } from "../../../shared/utils";
import type { AuditRow } from "../api/audit-log.queries";
import { AUDIT_ACTOR_TYPE_LABEL_KEYS } from "../audit-actor-type-labels";

interface AuditRowProps {
  row: AuditRow;
  onSelect: (row: AuditRow) => void;
}

export function AuditTableRow({ row, onSelect }: AuditRowProps) {
  const { t } = useTranslation("admin");
  const formatDateTime = useFormatDateTime();

  return (
    <TableRow>
      <TableCell>{formatDateTime(row.occurredAt)}</TableCell>
      <TableCell>{t(AUDIT_ACTOR_TYPE_LABEL_KEYS[row.actorType])}</TableCell>
      <TableCell>
        <TypographyInline font="mono" size="xs">
          {row.action}
        </TypographyInline>
      </TableCell>
      <TableCell>
        <TypographyInline font="mono" size="xs" tone="muted">
          {row.targetType} / {row.targetId}
        </TypographyInline>
      </TableCell>
      <TableCell>
        <TypographyInline font="mono" size="xs" tone="muted">
          {row.organizationId ?? EMPTY_VALUE}
        </TypographyInline>
      </TableCell>
      <TableCell>
        <Button variant="ghost" size="sm" onClick={() => onSelect(row)}>
          {t("auditLog.detailsAction")}
        </Button>
      </TableCell>
    </TableRow>
  );
}
