import { Button } from "@packages/ui/components/ui/button";
import { SkeletonTable } from "@packages/ui/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@packages/ui/components/ui/table";
import { TypographyH2, TypographyMuted } from "@packages/ui/components/ui/typography";
import { toastError } from "@packages/web-kit/api/errors/toast";
import { errorFallback } from "@packages/web-kit/i18n/get-errors-t";
import { useFormatDateTime } from "@packages/web-kit/i18n/use-format-date";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useStaff } from "../../../shared/auth/use-staff";
import { LoadErrorRetry } from "../../../shared/components/load-error-retry";
import { OPS_QUERY_KEY, requeueOutboxMutationOptions } from "../api/ops.mutations";
import { deadLettersQueryOptions } from "../api/ops.queries";

export function DeadEventsSection() {
  const { t } = useTranslation("admin");
  const formatDateTime = useFormatDateTime();
  const { can } = useStaff();
  const queryClient = useQueryClient();
  const query = useQuery(deadLettersQueryOptions);
  const items = query.data?.outbox.items ?? [];

  const requeue = useMutation({
    ...requeueOutboxMutationOptions,
    onSuccess: ({ requeued }) => {
      if (requeued > 0) toast.success(t("operations.dead.requeued"));
      else toast.info(t("operations.dead.nothingMoved"));

      void queryClient.invalidateQueries({ queryKey: OPS_QUERY_KEY });
    },
    onError: (err) => toastError(err, errorFallback("requeueOutbox")),
  });

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <TypographyH2>{t("operations.dead.title")}</TypographyH2>
        {can("ops.manage") && items.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            disabled={requeue.isPending}
            onClick={() => requeue.mutate(items.map((item) => item.id))}
          >
            {t("operations.dead.requeueAll")}
          </Button>
        )}
      </div>

      {query.isPending && <SkeletonTable label={t("operations.dead.loading")} columns={4} />}

      {query.isError && (
        <LoadErrorRetry message={t("operations.dead.loadFailed")} onRetry={query.refetch} />
      )}

      {query.data && items.length === 0 && (
        <TypographyMuted>{t("operations.dead.empty")}</TypographyMuted>
      )}

      {query.data && items.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("operations.dead.table.event")}</TableHead>
              <TableHead className="hidden md:table-cell">
                {t("operations.dead.table.deadAt")}
              </TableHead>
              <TableHead className="hidden md:table-cell">
                {t("operations.dead.table.attempts")}
              </TableHead>
              {can("ops.manage") && (
                <TableHead>
                  <span className="sr-only">{t("operations.dead.requeue")}</span>
                </TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.id}>
                <TableCell className="whitespace-normal wrap-anywhere">
                  {item.eventType}
                  <TypographyMuted>{item.lastError ?? item.id}</TypographyMuted>
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  {formatDateTime(item.deadAt)}
                </TableCell>
                <TableCell className="hidden md:table-cell">{item.attempts}</TableCell>
                {can("ops.manage") && (
                  <TableCell>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={requeue.isPending}
                      onClick={() => requeue.mutate([item.id])}
                    >
                      {t("operations.dead.requeue")}
                    </Button>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {query.data && query.data.outbox.total > items.length && (
        <TypographyMuted>
          {t("operations.dead.partial", { shown: items.length, total: query.data.outbox.total })}
        </TypographyMuted>
      )}

      {query.data && (
        <TypographyMuted>{t("operations.dead.otherQueues", query.data.queues)}</TypographyMuted>
      )}
    </section>
  );
}
