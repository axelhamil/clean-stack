import { Badge } from "@packages/ui/components/ui/badge";
import { Button } from "@packages/ui/components/ui/button";
import { CodeBlock } from "@packages/ui/components/ui/code-block";
import { Panel } from "@packages/ui/components/ui/panel";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@packages/ui/components/ui/sheet";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useActiveOrgId } from "../../../shared/auth/use-active-org-id";
import type { ImpersonationGuard } from "../../../shared/auth/use-impersonation-guard";
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
          <CodeBlock size="sm" className="mt-1">
            {JSON.stringify(attempt.requestHeaders, null, 2)}
          </CodeBlock>
        </details>
      )}
      {attempt.requestBody !== null && (
        <details>
          <summary className="cursor-pointer text-xs text-muted-foreground">
            {t("webhooks.deliverySheet.requestBody")}
          </summary>
          <CodeBlock size="sm" className="mt-1">
            {attempt.requestBody}
          </CodeBlock>
        </details>
      )}
      {attempt.responseHeaders !== null && (
        <details>
          <summary className="cursor-pointer text-xs text-muted-foreground">
            {t("webhooks.deliverySheet.responseHeaders")}
          </summary>
          <CodeBlock size="sm" className="mt-1">
            {JSON.stringify(attempt.responseHeaders, null, 2)}
          </CodeBlock>
        </details>
      )}
      {attempt.responseBody !== null && (
        <details>
          <summary className="cursor-pointer text-xs text-muted-foreground">
            {t("webhooks.deliverySheet.responseBody")}
          </summary>
          <CodeBlock size="sm" className="mt-1">
            {attempt.responseBody}
          </CodeBlock>
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
  guard: ImpersonationGuard;
}

export function DeliverySheet({
  endpointId,
  delivery,
  canReplay,
  onReplay,
  onClose,
  guard,
}: DeliverySheetProps) {
  const { t } = useTranslation(["settings", "common"]);
  const organizationId = useActiveOrgId();
  const detail = useQuery(
    webhookDeliveryDetailQueryOptions(organizationId, endpointId, delivery?.id ?? ""),
  );

  return (
    <Sheet open={delivery !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full sm:max-w-xl">
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
                disabled={guard.blocked}
                {...guard.describeProps()}
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
                  <Panel key={a.id} asChild className="text-xs">
                    <li>
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
                  </Panel>
                ))}
              </ol>
            )}
            {detail.data && (
              <section className="mt-6">
                <h3 className="mb-2 text-sm font-medium">{t("webhooks.deliverySheet.payload")}</h3>
                <CodeBlock>
                  <code>{JSON.stringify(detail.data.payload, null, 2)}</code>
                </CodeBlock>
              </section>
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
