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
import type { AdminUserDetail } from "../api/admin-users.queries";

type Session = AdminUserDetail["sessions"][number];

interface SessionsCardProps {
  sessions: Session[];
}

export function SessionsCard({ sessions }: SessionsCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Sessions actives ({sessions.length})</CardTitle>
      </CardHeader>
      <CardContent>
        {sessions.length === 0 ? (
          <p>Aucune session active.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>IP</TableHead>
                <TableHead>Navigateur</TableHead>
                <TableHead>Créée le</TableHead>
                <TableHead>Expire le</TableHead>
                <TableHead>Type</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sessions.map((session) => (
                <TableRow key={session.id}>
                  <TableCell>{session.ipAddress ?? "—"}</TableCell>
                  <TableCell className="max-w-xs truncate">{session.userAgent ?? "—"}</TableCell>
                  <TableCell>{new Date(session.createdAt).toLocaleDateString("fr-FR")}</TableCell>
                  <TableCell>{new Date(session.expiresAt).toLocaleDateString("fr-FR")}</TableCell>
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
