import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@packages/ui/components/ui/sheet";
import type { AuditRow } from "../api/audit-log.queries";

interface MetadataSheetProps {
  row: AuditRow | null;
  onClose: () => void;
}

export function MetadataSheet({ row, onClose }: MetadataSheetProps) {
  const hasDiff =
    row?.metadata !== null &&
    typeof row?.metadata === "object" &&
    "before" in (row.metadata as object) &&
    "after" in (row.metadata as object);

  return (
    <Sheet open={row !== null} onOpenChange={() => onClose()}>
      <SheetContent>
        {row && (
          <>
            <SheetHeader>
              <SheetTitle>{row.action}</SheetTitle>
            </SheetHeader>
            <dl className="flex flex-col gap-2">
              <div>
                <dt className="text-sm font-medium">Actor</dt>
                <dd className="text-sm">{row.actorId ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium">Occurred at</dt>
                <dd className="text-sm">{row.occurredAt as unknown as string}</dd>
              </div>
            </dl>
            {hasDiff ? (
              <div className="flex gap-4 overflow-x-auto">
                <div className="flex flex-col gap-1">
                  <span className="text-sm font-medium">Before</span>
                  <pre className="text-xs">
                    {JSON.stringify((row.metadata as { before: unknown }).before, null, 2)}
                  </pre>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-sm font-medium">After</span>
                  <pre className="text-xs">
                    {JSON.stringify((row.metadata as { after: unknown }).after, null, 2)}
                  </pre>
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <pre className="text-xs">{JSON.stringify(row.metadata, null, 2)}</pre>
              </div>
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
