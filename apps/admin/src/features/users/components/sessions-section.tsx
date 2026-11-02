import { Badge } from "@packages/ui/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@packages/ui/components/ui/table";
import { TruncatedText } from "@packages/ui/components/ui/truncated-text";
import { TypographyH2, TypographyMuted } from "@packages/ui/components/ui/typography";
import { useFormatDate } from "@packages/web-kit/i18n/use-format-date";
import { useTranslation } from "react-i18next";

const EMPTY_VALUE = "-";

export interface StaffSessionRow {
  id: string;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  expiresAt: string;
  impersonatedBy: string | null;
}

interface SessionsSectionProps {
  sessions: StaffSessionRow[];
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
              <TableHead className="hidden md:table-cell">
                {t("users.sessions.browserHeader")}
              </TableHead>
              <TableHead className="hidden md:table-cell">
                {t("users.sessions.createdHeader")}
              </TableHead>
              <TableHead>{t("users.sessions.expiresHeader")}</TableHead>
              <TableHead>{t("users.sessions.typeHeader")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sessions.map((session) => (
              <TableRow key={session.id}>
                <TableCell>{session.ipAddress ?? EMPTY_VALUE}</TableCell>
                <TableCell className="hidden md:table-cell">
                  <TruncatedText value={session.userAgent ?? EMPTY_VALUE} className="max-w-xs" />
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  {formatDate(session.createdAt)}
                </TableCell>
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
