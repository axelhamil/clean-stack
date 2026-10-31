import { ListRow, ListRowContent } from "@packages/ui/components/ui/list-row";
import { NavLink } from "@packages/ui/components/ui/nav-link";
import { TypographyH2, TypographyMuted } from "@packages/ui/components/ui/typography";
import { useFormatDateTime } from "@packages/web-kit/i18n/use-format-date";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useStaff } from "../../../shared/auth/use-staff";
import { approvalActionLabelKey } from "../../../shared/labels/approval-action";

export interface InboxApprovalsProps {
  total: number;
  items: { id: string; action: string; requestedBy: string; createdAt: string }[];
}

export function InboxApprovals({ total, items }: InboxApprovalsProps) {
  const { t } = useTranslation("admin");
  const formatDateTime = useFormatDateTime();
  const { me } = useStaff();

  return (
    <section className="flex min-w-0 flex-col gap-4">
      <TypographyH2>{t("backOffice.inbox.approvals.title")}</TypographyH2>
      <ul className="flex flex-col gap-2">
        {items.map((item) => {
          const labelKey = approvalActionLabelKey(item.action);
          const askedAt = formatDateTime(item.createdAt);

          return (
            <ListRow key={item.id}>
              <ListRowContent className="min-w-0">
                <NavLink asChild variant="plain">
                  <Link to="/approvals/$id" params={{ id: item.id }}>
                    {labelKey ? t(labelKey) : item.action}
                  </Link>
                </NavLink>
                <TypographyMuted>
                  {t(
                    item.requestedBy === me.id
                      ? "backOffice.inbox.approvals.askedByYou"
                      : "backOffice.inbox.approvals.asked",
                    { date: askedAt },
                  )}
                </TypographyMuted>
              </ListRowContent>
            </ListRow>
          );
        })}
      </ul>
      {total > items.length && (
        <NavLink asChild variant="plain">
          <Link to="/approvals" search={{ status: "pending" }}>
            {t("backOffice.inbox.approvals.seeAll", { count: total })}
          </Link>
        </NavLink>
      )}
    </section>
  );
}
