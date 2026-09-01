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
import { useFormatDate } from "../../../shared/i18n/use-format-date";
import type { AdminUserDetail } from "../api/admin-users.queries";

type Session = AdminUserDetail["sessions"][number];

interface SessionsCardProps {
  sessions: Session[];
}

export function SessionsCard({ sessions }: SessionsCardProps) {
  const formatDate = useFormatDate();
  const { t } = useTranslation("admin");
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("users.sessions.title", { count: sessions.length })}</CardTitle>
      </CardHeader>
      <CardContent>
        {sessions.length === 0 ? (
          <p>{t("users.sessions.empty")}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("users.sessions.ipHeader")}</TableHead>
                <TableHead>{t("users.sessions.browserHeader")}</TableHead>
                <TableHead>{t("users.sessions.createdHeader")}</TableHead>
                <TableHead>{t("users.sessions.expiresHeader")}</TableHead>
                <TableHead>{t("users.sessions.typeHeader")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sessions.map((session) => (
                <TableRow key={session.id}>
                  <TableCell>{session.ipAddress ?? "—"}</TableCell>
                  <TableCell className="max-w-xs overflow-hidden">
                    {session.userAgent ?? "—"}
                  </TableCell>
                  <TableCell>{formatDate(session.createdAt)}</TableCell>
                  <TableCell>{formatDate(session.expiresAt)}</TableCell>
                  <TableCell>
                    {session.impersonatedBy ? (
                      <Badge variant="secondary">{t("users.sessions.typeImpersonation")}</Badge>
                    ) : (
                      <Badge variant="outline">{t("users.sessions.typeNormal")}</Badge>
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
