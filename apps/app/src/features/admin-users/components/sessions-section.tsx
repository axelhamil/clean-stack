import { Badge } from "@packages/ui/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@packages/ui/components/ui/table";
import { TypographyH2, TypographyMuted } from "@packages/ui/components/ui/typography";
import { useTranslation } from "react-i18next";
import { useFormatDate } from "../../../shared/i18n/use-format-date";
import { EMPTY_VALUE } from "../../../shared/utils";
import type { AdminUserDetail } from "../api/admin-users.queries";

type Session = AdminUserDetail["sessions"][number];

interface SessionsSectionProps {
  sessions: Session[];
}

export function SessionsSection({ sessions }: SessionsSectionProps) {
  const formatDate = useFormatDate();
  const { t } = useTranslation("admin");

  return (
    <section className="flex min-w-0 flex-col gap-4">
      <TypographyH2>{t("users.sessions.title", { count: sessions.length })}</TypographyH2>
      {sessions.length === 0 ? (
        <TypographyMuted>{t("users.sessions.empty")}</TypographyMuted>
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
                <TableCell>{session.ipAddress ?? EMPTY_VALUE}</TableCell>
                <TableCell className="max-w-xs truncate" title={session.userAgent ?? undefined}>
                  {session.userAgent ?? EMPTY_VALUE}
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
    </section>
  );
}
