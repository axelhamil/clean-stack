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
import { TypographyInline, TypographyMuted } from "@packages/ui/components/ui/typography";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useActiveOrgId } from "../../../shared/auth/use-active-org-id";
import type { ImpersonationGuard } from "../../../shared/auth/use-impersonation-guard";
import type { DeliveryAttempt, DeliveryListItem } from "../api/webhooks.queries";
import { webhookDeliveryDetailQueryOptions } from "../api/webhooks.queries";
import { DELIVERY_STATUS_KEYS, isDeliveryStatus } from "../webhook-labels";

type AttemptSectionKey = "requestHeaders" | "requestBody" | "responseHeaders" | "responseBody";

const ATTEMPT_SECTIONS: readonly AttemptSectionKey[] = [
  "requestHeaders",
  "requestBody",
  "responseHeaders",
  "responseBody",
];

function formatSection(value: DeliveryAttempt[AttemptSectionKey]): string {
  return typeof value === "string" ? value : JSON.stringify(value, null, 2);
}

interface RequestResponseProps {
  attempt: DeliveryAttempt;
}

function RequestResponse({ attempt }: RequestResponseProps) {
  const { t } = useTranslation("settings");

  return (
    <div className="mt-2 flex flex-col gap-1">
      {ATTEMPT_SECTIONS.map((key) => {
        const value = attempt[key];
        if (value === null) return null;

        return (
          <details key={key}>
            <summary className="cursor-pointer">
              <TypographyInline tone="muted" size="xs">
                {t(`webhooks.deliverySheet.${key}`)}
              </TypographyInline>
            </summary>
            <CodeBlock size="sm" className="mt-1">
              {formatSection(value)}
            </CodeBlock>
          </details>
        );
      })}
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
      <SheetContent closeLabel={t("common:actions.close")} className="w-full sm:max-w-xl">
        {delivery && (
          <>
            <SheetHeader>
              <SheetTitle>
                <TypographyInline font="mono" size="sm">
                  {delivery.eventType}
                </TypographyInline>
              </SheetTitle>
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
              <TypographyMuted>{t("webhooks.deliverySheet.loadingAttempts")}</TypographyMuted>
            )}
            {detail.data && (
              <ol className="flex flex-col gap-4">
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
                        <TypographyInline tone="muted">
                          {t("webhooks.deliverySheet.duration", { ms: a.durationMs })}
                        </TypographyInline>
                      )}
                      {a.error && <TypographyInline tone="destructive">{a.error}</TypographyInline>}
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
