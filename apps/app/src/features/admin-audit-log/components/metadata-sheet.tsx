import { CodeBlock } from "@packages/ui/components/ui/code-block";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@packages/ui/components/ui/sheet";
import { TypographySmall } from "@packages/ui/components/ui/typography";
import { useTranslation } from "react-i18next";
import { useFormatDateTime } from "../../../shared/i18n/use-format-date";
import { EMPTY_VALUE } from "../../../shared/utils";
import type { AuditRow } from "../api/audit-log.queries";

interface MetadataDiff {
  before: unknown;
  after: unknown;
}

function diffOf(metadata: unknown): MetadataDiff | null {
  if (typeof metadata !== "object" || metadata === null) return null;
  if (!("before" in metadata) || !("after" in metadata)) return null;

  return { before: metadata.before, after: metadata.after };
}

interface MetadataSheetProps {
  row: AuditRow | null;
  onClose: () => void;
}

export function MetadataSheet({ row, onClose }: MetadataSheetProps) {
  const { t } = useTranslation("admin");
  const { t: tCommon } = useTranslation("common");
  // Same reasoning as `audit-row.tsx`: an audit event's occurred-at needs
  // date+time precision, not the date-only `useFormatDate`.
  const formatDateTime = useFormatDateTime();
  const diff = diffOf(row?.metadata);

  return (
    <Sheet open={row !== null} onOpenChange={() => onClose()}>
      <SheetContent closeLabel={tCommon("actions.close")}>
        {row && (
          <>
            <SheetHeader>
              <SheetTitle>{row.action}</SheetTitle>
            </SheetHeader>
            <dl className="flex flex-col gap-2">
              <div>
                <dt className="text-sm font-medium">{t("auditLog.metadata.actorLabel")}</dt>
                <dd className="text-sm">{row.actorId ?? EMPTY_VALUE}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium">{t("auditLog.metadata.occurredAtLabel")}</dt>
                <dd className="text-sm">{formatDateTime(row.occurredAt)}</dd>
              </div>
            </dl>
            {diff ? (
              <div className="flex gap-4 overflow-x-auto">
                <div className="flex flex-col gap-1">
                  <TypographySmall>{t("auditLog.metadata.beforeLabel")}</TypographySmall>
                  <CodeBlock>{JSON.stringify(diff.before, null, 2)}</CodeBlock>
                </div>
                <div className="flex flex-col gap-1">
                  <TypographySmall>{t("auditLog.metadata.afterLabel")}</TypographySmall>
                  <CodeBlock>{JSON.stringify(diff.after, null, 2)}</CodeBlock>
                </div>
              </div>
            ) : (
              <CodeBlock>{JSON.stringify(row.metadata, null, 2)}</CodeBlock>
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
