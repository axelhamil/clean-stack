import { Badge } from "@packages/ui/components/ui/badge";
import { Button } from "@packages/ui/components/ui/button";
import { TableCell, TableRow } from "@packages/ui/components/ui/table";
import type { AuditRow } from "../api/audit-log.queries";

interface AuditRowProps {
  row: AuditRow;
  onSelect: (row: AuditRow) => void;
}

export function AuditTableRow({ row, onSelect }: AuditRowProps) {
  return (
    <TableRow>
      <TableCell>{row.occurredAt as unknown as string}</TableCell>
      <TableCell>
        <Badge variant="secondary">{row.actorType}</Badge>
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
          Details
        </Button>
      </TableCell>
    </TableRow>
  );
}
