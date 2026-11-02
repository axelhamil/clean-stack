import { CodeBlock } from "@packages/ui/components/ui/code-block";
import {
  DescriptionDetails,
  DescriptionItem,
  DescriptionList,
  DescriptionTerm,
} from "@packages/ui/components/ui/description-list";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@packages/ui/components/ui/sheet";
import { TypographySmall } from "@packages/ui/components/ui/typography";
import { useFormatDateTime } from "@packages/web-kit/i18n/use-format-date";
import { useTranslation } from "react-i18next";

const EMPTY_VALUE = "-";

export interface AuditMetadataRow {
  action: string;
  actorId: string | null;
  occurredAt: string;
  metadata?: unknown;
}

interface MetadataDiff {
  before: unknown;
  after: unknown;
}

function diffOf(metadata: unknown): MetadataDiff | null {
  if (typeof metadata !== "object" || metadata === null) return null;
  if (!("before" in metadata) || !("after" in metadata)) return null;

  return { before: metadata.before, after: metadata.after };
}

export interface AuditMetadataSheetProps {
  row: AuditMetadataRow | null;
  onClose: () => void;
}

export function AuditMetadataSheet({ row, onClose }: AuditMetadataSheetProps) {
  const { t } = useTranslation("admin");
  const { t: tCommon } = useTranslation("common");
  const formatDateTime = useFormatDateTime();
  const diff = diffOf(row?.metadata);

  return (
    <Sheet open={row !== null} onOpenChange={() => onClose()}>
      <SheetContent closeLabel={tCommon("actions.close")}>
        {row && (
          <>
            <SheetHeader>
              <SheetTitle className="pr-6 break-words">{row.action}</SheetTitle>
            </SheetHeader>
            <div className="flex min-w-0 flex-col gap-4 px-4 pb-4">
              <DescriptionList>
                <DescriptionItem>
                  <DescriptionTerm>{t("auditLog.metadata.actorLabel")}</DescriptionTerm>
                  <DescriptionDetails className="break-all">
                    {row.actorId ?? EMPTY_VALUE}
                  </DescriptionDetails>
                </DescriptionItem>
                <DescriptionItem>
                  <DescriptionTerm>{t("auditLog.metadata.occurredAtLabel")}</DescriptionTerm>
                  <DescriptionDetails>{formatDateTime(row.occurredAt)}</DescriptionDetails>
                </DescriptionItem>
              </DescriptionList>
              {diff ? (
                <>
                  <div className="flex flex-col gap-1">
                    <TypographySmall>{t("auditLog.metadata.beforeLabel")}</TypographySmall>
                    <CodeBlock>{JSON.stringify(diff.before, null, 2)}</CodeBlock>
                  </div>
                  <div className="flex flex-col gap-1">
                    <TypographySmall>{t("auditLog.metadata.afterLabel")}</TypographySmall>
                    <CodeBlock>{JSON.stringify(diff.after, null, 2)}</CodeBlock>
                  </div>
                </>
              ) : (
                <CodeBlock>{JSON.stringify(row.metadata, null, 2)}</CodeBlock>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
