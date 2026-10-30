import { Badge } from "@packages/ui/components/ui/badge";
import { Button } from "@packages/ui/components/ui/button";
import { Hint } from "@packages/ui/components/ui/hint";
import { LoadErrorAlert } from "@packages/ui/components/ui/load-error-alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@packages/ui/components/ui/select";
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
import { useInfiniteQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { toastError } from "../../../shared/api/errors/toast";
import { useActiveOrgId } from "../../../shared/auth/use-active-org-id";
import type { ImpersonationGuard } from "../../../shared/auth/use-impersonation-guard";
import { errorFallback } from "../../../shared/i18n/get-errors-t";
import { useFormatDate } from "../../../shared/i18n/use-format-date";
import { replayDeliveryMutationOptions } from "../api/webhooks.mutations";
import type { DeliveryListItem } from "../api/webhooks.queries";
import { webhookDeliveriesInfiniteQueryOptions } from "../api/webhooks.queries";
import type { DeliveryFilters } from "../webhook-delivery-filters";
import {
  DELIVERY_STATUS_BADGE_VARIANTS,
  DELIVERY_STATUS_HINT_KEYS,
  DELIVERY_STATUS_KEYS,
  isDeliveryStatus,
} from "../webhook-labels";
import { DeliverySheet } from "./delivery-sheet";

const ALL_DELIVERY_STATUSES = "all";

export interface DeliveriesSectionProps {
  endpointId: string;
  canWrite: boolean;
  guard: ImpersonationGuard;
}

export function DeliveriesSection({ endpointId, canWrite, guard }: DeliveriesSectionProps) {
  const { t } = useTranslation(["settings", "common", "errors"]);
  const formatDate = useFormatDate();
  const organizationId = useActiveOrgId();
  const [selectedDelivery, setSelectedDelivery] = useState<DeliveryListItem | null>(null);
  const [filters, setFilters] = useState<DeliveryFilters>({});

  const deliveryStatusHint = (status: DeliveryListItem["status"]) => {
    const key = DELIVERY_STATUS_HINT_KEYS[status];

    return key ? t(key) : undefined;
  };

  const deliveries = useInfiniteQuery(
    webhookDeliveriesInfiniteQueryOptions(organizationId, endpointId, filters),
  );

  const replay = useMutation({
    ...replayDeliveryMutationOptions,
    onSuccess: () => toast.success(t("settings:webhooks.deliveryReplayedToast")),
    onError: (err) => toastError(err, errorFallback("replayWebhookDelivery")),
  });

  const items = deliveries.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <>
      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <TypographyH2>{t("settings:webhooks.deliveries.title")}</TypographyH2>
          <Select
            value={filters.status ?? ALL_DELIVERY_STATUSES}
            onValueChange={(v) =>
              setFilters((f) => ({
                ...f,
                status: isDeliveryStatus(v) ? v : undefined,
              }))
            }
          >
            <SelectTrigger
              className="w-40"
              aria-label={t("settings:webhooks.deliveries.statusHeader")}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_DELIVERY_STATUSES}>
                {t("settings:webhooks.deliveries.allStatusFilter")}
              </SelectItem>
              <SelectItem value="pending">{t(DELIVERY_STATUS_KEYS.pending)}</SelectItem>
              <SelectItem value="success">{t(DELIVERY_STATUS_KEYS.success)}</SelectItem>
              <SelectItem value="failed">{t(DELIVERY_STATUS_KEYS.failed)}</SelectItem>
              <SelectItem value="dead_letter">{t(DELIVERY_STATUS_KEYS.dead_letter)}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {deliveries.isPending ? (
          <TypographyMuted role="status">
            {t("settings:webhooks.deliveries.loading")}
          </TypographyMuted>
        ) : deliveries.isLoadingError ? (
          <LoadErrorAlert message={t("errors:fallback.loadWebhookDeliveries")} />
        ) : items.length === 0 ? (
          <TypographyMuted>{t("settings:webhooks.deliveries.empty")}</TypographyMuted>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("settings:webhooks.deliveries.eventTypeHeader")}</TableHead>
                  <TableHead>{t("settings:webhooks.deliveries.statusHeader")}</TableHead>
                  <TableHead className="hidden sm:table-cell">
                    {t("settings:webhooks.deliveries.attemptsHeader")}
                  </TableHead>
                  <TableHead className="hidden sm:table-cell">
                    {t("settings:webhooks.deliveries.createdHeader")}
                  </TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell>
                      <TruncatedText
                        value={d.eventType}
                        font="mono"
                        className="max-w-32 sm:max-w-xs"
                      />
                    </TableCell>
                    <TableCell>
                      <Hint text={deliveryStatusHint(d.status)}>
                        <Badge variant={DELIVERY_STATUS_BADGE_VARIANTS[d.status]}>
                          {isDeliveryStatus(d.status)
                            ? t(DELIVERY_STATUS_KEYS[d.status])
                            : d.status}
                        </Badge>
                      </Hint>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">{d.attempts}</TableCell>
                    <TableCell className="hidden sm:table-cell">
                      {formatDate(d.createdAt)}
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm" onClick={() => setSelectedDelivery(d)}>
                        {t("settings:webhooks.deliveries.detailsAction")}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {deliveries.hasNextPage && (
              <Button
                variant="outline"
                className="self-start"
                disabled={deliveries.isFetchingNextPage}
                onClick={() => void deliveries.fetchNextPage()}
              >
                {t("settings:webhooks.deliveries.loadMore")}
              </Button>
            )}
          </>
        )}
      </section>

      <DeliverySheet
        endpointId={endpointId}
        delivery={selectedDelivery}
        canReplay={canWrite}
        onReplay={(deliveryId) => replay.mutate({ endpointId, deliveryId })}
        onClose={() => setSelectedDelivery(null)}
        guard={guard}
      />
    </>
  );
}
