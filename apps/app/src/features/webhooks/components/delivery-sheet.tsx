import { Badge } from "@packages/ui/components/ui/badge";
import { Button } from "@packages/ui/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@packages/ui/components/ui/sheet";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { DeliveryAttempt, DeliveryListItem } from "../api/webhooks.queries";
import { webhookDeliveryDetailQueryOptions } from "../api/webhooks.queries";
import { DELIVERY_STATUS_KEYS, isDeliveryStatus } from "../webhook-labels";

interface RequestResponseProps {
  attempt: DeliveryAttempt;
}

function RequestResponse({ attempt }: RequestResponseProps) {
  const { t } = useTranslation("settings");

  return (
    <div className="mt-2 flex flex-col gap-1">
      {attempt.requestHeaders !== null && (
        <details>
          <summary className="cursor-pointer text-xs text-muted-foreground">
            {t("webhooks.deliverySheet.requestHeaders")}
          </summary>
          <pre className="mt-1 overflow-x-auto rounded bg-muted p-2 text-xs">
            {JSON.stringify(attempt.requestHeaders, null, 2)}
          </pre>
        </details>
      )}
      {attempt.requestBody !== null && (
        <details>
          <summary className="cursor-pointer text-xs text-muted-foreground">
            {t("webhooks.deliverySheet.requestBody")}
          </summary>
          <pre className="mt-1 overflow-x-auto rounded bg-muted p-2 text-xs">
            {attempt.requestBody}
          </pre>
        </details>
      )}
      {attempt.responseHeaders !== null && (
        <details>
          <summary className="cursor-pointer text-xs text-muted-foreground">
            {t("webhooks.deliverySheet.responseHeaders")}
          </summary>
          <pre className="mt-1 overflow-x-auto rounded bg-muted p-2 text-xs">
            {JSON.stringify(attempt.responseHeaders, null, 2)}
          </pre>
        </details>
      )}
      {attempt.responseBody !== null && (
        <details>
          <summary className="cursor-pointer text-xs text-muted-foreground">
            {t("webhooks.deliverySheet.responseBody")}
          </summary>
          <pre className="mt-1 overflow-x-auto rounded bg-muted p-2 text-xs">
            {attempt.responseBody}
          </pre>
        </details>
      )}
    </div>
  );
}

interface DeliverySheetProps {
  endpointId: string;
  delivery: DeliveryListItem | null;
  canReplay: boolean;
  onReplay: (deliveryId: string) => void;
  onClose: () => void;
  disabledReason?: string;
}

export function DeliverySheet({
  endpointId,
  delivery,
  canReplay,
  onReplay,
  onClose,
  disabledReason,
}: DeliverySheetProps) {
  const { t } = useTranslation(["settings", "common"]);
  const detail = useQuery({
    ...webhookDeliveryDetailQueryOptions(endpointId, delivery?.id ?? ""),
    enabled: delivery !== null,
  });

  return (
    <Sheet open={delivery !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        {delivery && (
          <>
            <SheetHeader>
              <SheetTitle className="font-mono text-sm">{delivery.eventType}</SheetTitle>
              <SheetDescription>
                {t("webhooks.deliverySheet.statusLine", {
                  status: isDeliveryStatus(delivery.status)
                    ? t(DELIVERY_STATUS_KEYS[delivery.status])
                    : delivery.status,
                  count: delivery.attempts,
                })}
              </SheetDescription>
            </SheetHeader>
            {canReplay && (
              <Button
                className="my-4"
                variant="outline"
                disabled={Boolean(disabledReason)}
                title={disabledReason}
                onClick={() => onReplay(delivery.id)}
              >
                {t("webhooks.deliverySheet.replay")}
              </Button>
            )}
            {detail.isLoading && (
              <p className="text-sm text-muted-foreground">
                {t("webhooks.deliverySheet.loadingAttempts")}
              </p>
            )}
            {detail.data && (
              <ol className="space-y-4">
                {detail.data.attemptHistory.map((a) => (
                  <li key={a.id} className="rounded-md border p-3 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">
                        {t("webhooks.deliverySheet.attemptNumber", { number: a.attemptNumber })}
                      </span>
                      <Badge
                        variant={
                          a.responseStatus !== null && a.responseStatus < 400
                            ? "default"
                            : "destructive"
                        }
                      >
                        {a.responseStatus ?? a.error ?? t("webhooks.deliverySheet.noResponse")}
                      </Badge>
                    </div>
                    {a.durationMs !== null && (
                      <p className="text-muted-foreground">{a.durationMs} ms</p>
                    )}
                    {a.error && <p className="text-destructive">{a.error}</p>}
                    <RequestResponse attempt={a} />
                  </li>
                ))}
              </ol>
            )}
            {detail.data && (
              <section className="mt-6">
                <h3 className="mb-2 text-sm font-medium">{t("webhooks.deliverySheet.payload")}</h3>
                <pre className="overflow-x-auto rounded bg-muted p-3 text-xs">
                  <code>{JSON.stringify(detail.data.payload, null, 2)}</code>
                </pre>
              </section>
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
