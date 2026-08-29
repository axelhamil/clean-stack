import { Badge } from "@packages/ui/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@packages/ui/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@packages/ui/components/ui/table";
import { useTranslation } from "react-i18next";
import { formatDate } from "../../../shared/utils";
import type { AdminUserDetail } from "../api/admin-users.queries";

type Session = AdminUserDetail["sessions"][number];

interface SessionsCardProps {
  sessions: Session[];
}

export function SessionsCard({ sessions }: SessionsCardProps) {
  const { i18n } = useTranslation();
  return (
    <Card>
      <CardHeader>
        <CardTitle>Active sessions ({sessions.length})</CardTitle>
      </CardHeader>
      <CardContent>
        {sessions.length === 0 ? (
          <p>No active sessions.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>IP</TableHead>
                <TableHead>Browser</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead>Type</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sessions.map((session) => (
                <TableRow key={session.id}>
                  <TableCell>{session.ipAddress ?? "—"}</TableCell>
                  <TableCell className="max-w-xs overflow-hidden">
                    {session.userAgent ?? "—"}
                  </TableCell>
                  <TableCell>{formatDate(session.createdAt, i18n.language)}</TableCell>
                  <TableCell>{formatDate(session.expiresAt, i18n.language)}</TableCell>
                  <TableCell>
                    {session.impersonatedBy ? (
                      <Badge variant="secondary">Impersonation</Badge>
                    ) : (
                      <Badge variant="outline">Normal</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
