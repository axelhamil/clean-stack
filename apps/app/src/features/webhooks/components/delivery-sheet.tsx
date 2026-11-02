import { Badge } from "@packages/ui/components/ui/badge";
import { Button } from "@packages/ui/components/ui/button";
import { CodeBlock } from "@packages/ui/components/ui/code-block";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@packages/ui/components/ui/collapsible";
import { LoadErrorAlert } from "@packages/ui/components/ui/load-error-alert";
import { Panel } from "@packages/ui/components/ui/panel";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@packages/ui/components/ui/sheet";
import {
  TypographyInline,
  TypographyMuted,
  TypographySmall,
} from "@packages/ui/components/ui/typography";
import { useQuery } from "@tanstack/react-query";
import { ChevronRightIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { GuardHint } from "../../../shared/auth/guard-hint";
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
    <div className="flex min-w-0 flex-col items-start gap-2">
      {ATTEMPT_SECTIONS.map((key) => {
        const value = attempt[key];
        if (value === null) return null;

        return (
          <Collapsible key={key} className="flex w-full min-w-0 flex-col items-start gap-1">
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="xs" className="group">
                <ChevronRightIcon className="transition-transform group-data-[state=open]:rotate-90" />
                {t(`webhooks.deliverySheet.${key}`)}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="w-full">
              <CodeBlock size="sm">{formatSection(value)}</CodeBlock>
            </CollapsibleContent>
          </Collapsible>
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
  const { t } = useTranslation(["settings", "common", "errors"]);
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
            <div className="flex min-w-0 flex-col items-start gap-4 px-4 pb-4">
              {canReplay && (
                <GuardHint guard={guard}>
                  <Button
                    disabled={guard.blocked}
                    {...guard.describeProps()}
                    onClick={() => onReplay(delivery.id)}
                  >
                    {t("webhooks.deliverySheet.replay")}
                  </Button>
                </GuardHint>
              )}
              {detail.isLoading && (
                <TypographyMuted role="status">
                  {t("webhooks.deliverySheet.loadingAttempts")}
                </TypographyMuted>
              )}
              {detail.isLoadingError && (
                <LoadErrorAlert message={t("errors:fallback.loadWebhookDeliveryDetail")} />
              )}
              {detail.data && (
                <>
                  <ol className="flex w-full min-w-0 flex-col gap-2">
                    {detail.data.attemptHistory.map((a) => (
                      <Panel key={a.id} asChild className="flex min-w-0 flex-col gap-2">
                        <li>
                          <div className="flex items-center justify-between gap-2">
                            <TypographySmall>
                              {t("webhooks.deliverySheet.attemptNumber", {
                                number: a.attemptNumber,
                              })}
                            </TypographySmall>
                            <Badge
                              variant={
                                a.responseStatus !== null && a.responseStatus < 400
                                  ? "default"
                                  : "destructive"
                              }
                            >
                              {a.responseStatus ?? t("webhooks.deliverySheet.noResponse")}
                            </Badge>
                          </div>
                          {a.durationMs !== null && (
                            <TypographyInline tone="muted" size="xs">
                              {t("webhooks.deliverySheet.duration", { ms: a.durationMs })}
                            </TypographyInline>
                          )}
                          {a.error && (
                            <TypographyInline tone="destructive" size="xs" className="break-words">
                              {a.error}
                            </TypographyInline>
                          )}
                          <RequestResponse attempt={a} />
                        </li>
                      </Panel>
                    ))}
                  </ol>
                  <section className="flex w-full min-w-0 flex-col gap-2">
                    <TypographySmall>{t("webhooks.deliverySheet.payload")}</TypographySmall>
                    <CodeBlock>
                      <code>{JSON.stringify(detail.data.payload, null, 2)}</code>
                    </CodeBlock>
                  </section>
                </>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
