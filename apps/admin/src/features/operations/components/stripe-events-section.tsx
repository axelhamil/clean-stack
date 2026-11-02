import { Badge } from "@packages/ui/components/ui/badge";
import { Button } from "@packages/ui/components/ui/button";
import { DestructiveActionDialog } from "@packages/ui/components/ui/destructive-action-dialog";
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
import { ItemsQueryList } from "../../../shared/components/query-list";
import { OPS_QUERY_KEY, replayStripeEventMutationOptions } from "../api/ops.mutations";
import { stripeEventsQueryOptions } from "../api/ops.queries";
import { STRIPE_STATUS_LABEL_KEYS } from "../operations-labels";

export function StripeEventsSection() {
  const { t } = useTranslation(["admin", "common"]);
  const formatDateTime = useFormatDateTime();
  const { can } = useStaff();
  const queryClient = useQueryClient();
  const query = useQuery(stripeEventsQueryOptions);
  const canReplay = can("ops.manage") && query.data?.configured === true;

  const replay = useMutation({
    ...replayStripeEventMutationOptions,
    onSuccess: () => {
      toast.success(t("operations.stripe.replayed"));
      void queryClient.invalidateQueries({ queryKey: OPS_QUERY_KEY });
    },
    onError: (err) => {
      toastError(err, errorFallback("replayStripeEvent"));
      void queryClient.invalidateQueries({ queryKey: OPS_QUERY_KEY });
    },
  });

  return (
    <section className="flex flex-col gap-4">
      <TypographyH2>{t("operations.stripe.title")}</TypographyH2>

      {query.data?.configured === false && (
        <TypographyMuted>{t("operations.stripe.notConfigured")}</TypographyMuted>
      )}

      <ItemsQueryList
        query={query}
        items={query.data?.items ?? []}
        loadingLabel={t("operations.stripe.loading")}
        errorMessage={t("operations.stripe.loadFailed")}
        emptyMessage={t("operations.stripe.empty")}
        columns={4}
      >
        {(events) => (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("operations.stripe.table.event")}</TableHead>
                <TableHead>{t("operations.stripe.table.status")}</TableHead>
                <TableHead className="hidden md:table-cell">
                  {t("operations.stripe.table.receivedAt")}
                </TableHead>
                <TableHead className="hidden md:table-cell">
                  {t("operations.stripe.table.replayedAt")}
                </TableHead>
                {canReplay && (
                  <TableHead>
                    <span className="sr-only">{t("operations.stripe.replay")}</span>
                  </TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {events.map((event) => (
                <TableRow key={event.id}>
                  <TableCell className="whitespace-normal wrap-anywhere">
                    {event.type}
                    <TypographyMuted>{event.lastError ?? event.id}</TypographyMuted>
                  </TableCell>
                  <TableCell>
                    <Badge variant={event.status === "failed" ? "destructive" : "secondary"}>
                      {t(STRIPE_STATUS_LABEL_KEYS[event.status])}
                    </Badge>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    {formatDateTime(event.receivedAt)}
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    {event.replayedAt && formatDateTime(event.replayedAt)}
                  </TableCell>
                  {canReplay && (
                    <TableCell>
                      {event.replayable && (
                        <DestructiveActionDialog
                          trigger={
                            <Button variant="outline" size="sm">
                              {t("operations.stripe.replay")}
                            </Button>
                          }
                          title={t("operations.stripe.replayTitle")}
                          description={t("operations.stripe.replayDescription")}
                          actionLabel={t("operations.stripe.replay")}
                          cancelLabel={t("common:actions.cancel")}
                          isPending={replay.isPending}
                          onConfirm={() => replay.mutate(event.id)}
                        />
                      )}
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </ItemsQueryList>
    </section>
  );
}
