import { Badge } from "@packages/ui/components/ui/badge";
import { Button } from "@packages/ui/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@packages/ui/components/ui/dialog";
import { pageContainerVariants } from "@packages/ui/components/ui/page-container";
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
import { TypographyH1 } from "@packages/ui/components/ui/typography";
import { cn } from "@packages/ui/libs/utils.js";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { toastError } from "../../shared/api/errors/toast";
import { Can } from "../../shared/auth/can";
import { ensureOrgPermission } from "../../shared/auth/ensure-org-permission";
import { ImpersonationReason } from "../../shared/auth/impersonation-reason";
import { useActiveOrgId } from "../../shared/auth/use-active-org-id";
import { useAuthorization } from "../../shared/auth/use-authorization";
import { useImpersonationGuard } from "../../shared/auth/use-impersonation-guard";
import { SecretRevealDialog } from "../../shared/components/secret-reveal-dialog";
import { getErrorsT } from "../../shared/i18n/get-errors-t";
import { useFormatDate } from "../../shared/i18n/use-format-date";
import {
  createEndpointMutationOptions,
  deleteEndpointMutationOptions,
  replayDeliveryMutationOptions,
  rotateSecretMutationOptions,
  sendTestMutationOptions,
  updateEndpointMutationOptions,
} from "./api/webhooks.mutations";
import type { DeliveryListItem, WebhookEndpoint } from "./api/webhooks.queries";
import {
  webhookDeliveriesInfiniteQueryOptions,
  webhookEndpointsQueryOptions,
} from "./api/webhooks.queries";
import { DeliverySheet } from "./components/delivery-sheet";
import { EndpointRow } from "./components/endpoint-row";
import { VerifySnippet } from "./components/verify-snippet";
import { WebhookForm } from "./forms/webhook-form";
import type { DeliveryFilters } from "./webhook-delivery-filters";
import { DELIVERY_STATUS_KEYS, isDeliveryStatus } from "./webhook-labels";

export const Route = createFileRoute("/_protected/_shell/settings/_org-scope/webhooks")({
  beforeLoad: ensureOrgPermission({ webhooks: ["read"] }),
  component: WebhooksPage,
});

function WebhooksPage() {
  const { t } = useTranslation(["settings", "common", "errors"]);
  const formatDate = useFormatDate();
  const qc = useQueryClient();
  const { can } = useAuthorization();
  const canWrite = can({ webhooks: ["write"] });
  const guard = useImpersonationGuard();

  const [selectedEndpointId, setSelectedEndpointId] = useState<string | null>(null);
  const [editing, setEditing] = useState<WebhookEndpoint | null>(null);
  const [creating, setCreating] = useState(false);
  const [revealSecret, setRevealSecret] = useState<string | null>(null);
  const [selectedDelivery, setSelectedDelivery] = useState<DeliveryListItem | null>(null);
  const [deliveryFilters, setDeliveryFilters] = useState<DeliveryFilters>({});

  const organizationId = useActiveOrgId();
  const endpoints = useQuery(webhookEndpointsQueryOptions(organizationId));

  const deliveries = useInfiniteQuery(
    webhookDeliveriesInfiniteQueryOptions(
      organizationId,
      selectedEndpointId ?? "",
      deliveryFilters,
    ),
  );

  const create = useMutation({
    ...createEndpointMutationOptions,
    onSuccess: (res) => {
      setRevealSecret(res.secret);
      setCreating(false);
      void qc.invalidateQueries({
        queryKey: webhookEndpointsQueryOptions(organizationId).queryKey,
      });
      toast.success(t("settings:webhooks.createdToast"));
    },
    onError: (err) =>
      toastError(
        err,
        getErrorsT()("fallback.createWebhookEndpoint", {
          defaultValue: "Failed to create webhook endpoint",
        }),
      ),
  });

  const update = useMutation({
    ...updateEndpointMutationOptions,
    onSuccess: () => {
      setEditing(null);
      void qc.invalidateQueries({
        queryKey: webhookEndpointsQueryOptions(organizationId).queryKey,
      });
      toast.success(t("settings:webhooks.updatedToast"));
    },
    onError: (err) =>
      toastError(
        err,
        getErrorsT()("fallback.updateWebhookEndpoint", {
          defaultValue: "Failed to update webhook endpoint",
        }),
      ),
  });

  const del = useMutation({
    ...deleteEndpointMutationOptions,
    onSuccess: () => {
      void qc.invalidateQueries({
        queryKey: webhookEndpointsQueryOptions(organizationId).queryKey,
      });
      toast.success(t("settings:webhooks.deletedToast"));
    },
    onError: (err) =>
      toastError(
        err,
        getErrorsT()("fallback.deleteWebhookEndpoint", {
          defaultValue: "Failed to delete webhook endpoint",
        }),
      ),
  });

  const rotate = useMutation({
    ...rotateSecretMutationOptions,
    onSuccess: (res) => {
      setRevealSecret(res.secret);
      toast.success(t("settings:webhooks.secretRotatedToast"));
    },
    onError: (err) =>
      toastError(
        err,
        getErrorsT()("fallback.rotateWebhookSecret", { defaultValue: "Failed to rotate secret" }),
      ),
  });

  const sendTest = useMutation({
    ...sendTestMutationOptions,
    onSuccess: () => toast.success(t("settings:webhooks.testSentToast")),
    onError: (err) =>
      toastError(
        err,
        getErrorsT()("fallback.sendWebhookTestEvent", {
          defaultValue: "Failed to send test event",
        }),
      ),
  });

  const replay = useMutation({
    ...replayDeliveryMutationOptions,
    onSuccess: () => toast.success(t("settings:webhooks.deliveryReplayedToast")),
    onError: (err) =>
      toastError(
        err,
        getErrorsT()("fallback.replayWebhookDelivery", {
          defaultValue: "Failed to replay delivery",
        }),
      ),
  });

  const dialogOpen = creating || editing !== null;

  const closeDialog = () => {
    setCreating(false);
    setEditing(null);
  };

  return (
    <main className={cn(pageContainerVariants(), "flex flex-col gap-6 py-10")}>
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <TypographyH1>{t("settings:webhooks.pageTitle")}</TypographyH1>
          <Link
            to="/developers/events"
            className="text-sm text-muted-foreground underline-offset-4 hover:underline"
          >
            {t("settings:webhooks.viewEventCatalog")}
          </Link>
        </div>
        <Can requires={{ webhooks: ["write"] }}>
          <Button
            onClick={() => setCreating(true)}
            disabled={guard.blocked}
            {...guard.describeProps()}
          >
            {t("settings:webhooks.addEndpoint")}
          </Button>
        </Can>
      </div>
      <ImpersonationReason guard={guard} />

      {endpoints.isLoading ? (
        <p>{t("settings:webhooks.loading")}</p>
      ) : endpoints.isError ? (
        <p>{t("errors:fallback.loadWebhookEndpoints")}</p>
      ) : endpoints.data?.items.length === 0 ? (
        <p className="text-muted-foreground">{t("settings:webhooks.noEndpoints")}</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("settings:webhooks.endpointsTable.urlHeader")}</TableHead>
              <TableHead>{t("settings:webhooks.endpointsTable.statusHeader")}</TableHead>
              <TableHead>{t("settings:webhooks.endpointsTable.eventsHeader")}</TableHead>
              <TableHead>{t("settings:webhooks.endpointsTable.createdHeader")}</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {endpoints.data?.items.map((e) => (
              <EndpointRow
                key={e.id}
                endpoint={e}
                canWrite={canWrite}
                onSelect={(ep) => setSelectedEndpointId(ep.id)}
                onEdit={(ep) => setEditing(ep)}
                onSendTest={(ep) => sendTest.mutate(ep.id)}
                onRotate={(ep) => rotate.mutate(ep.id)}
                onDelete={(ep) => del.mutate(ep.id)}
                guard={guard}
              />
            ))}
          </TableBody>
        </Table>
      )}

      <VerifySnippet />

      {selectedEndpointId !== null && (
        <>
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-medium">{t("settings:webhooks.deliveries.title")}</h2>
            <Select
              value={deliveryFilters.status ?? ""}
              onValueChange={(v) =>
                setDeliveryFilters((f) => ({
                  ...f,
                  status: (v as DeliveryFilters["status"]) || undefined,
                }))
              }
            >
              <SelectTrigger className="w-40">
                <SelectValue
                  placeholder={t("settings:webhooks.deliveries.allStatusesPlaceholder")}
                />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">
                  {t("settings:webhooks.deliveries.allStatusFilter")}
                </SelectItem>
                <SelectItem value="pending">{t(DELIVERY_STATUS_KEYS.pending)}</SelectItem>
                <SelectItem value="success">{t(DELIVERY_STATUS_KEYS.success)}</SelectItem>
                <SelectItem value="failed">{t(DELIVERY_STATUS_KEYS.failed)}</SelectItem>
                <SelectItem value="dead_letter">{t(DELIVERY_STATUS_KEYS.dead_letter)}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {deliveries.isLoading ? (
            <p>{t("settings:webhooks.deliveries.loading")}</p>
          ) : deliveries.isError ? (
            <p>{t("errors:fallback.loadWebhookDeliveries")}</p>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("settings:webhooks.deliveries.eventTypeHeader")}</TableHead>
                    <TableHead>{t("settings:webhooks.deliveries.statusHeader")}</TableHead>
                    <TableHead>{t("settings:webhooks.deliveries.attemptsHeader")}</TableHead>
                    <TableHead>{t("settings:webhooks.deliveries.createdHeader")}</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {deliveries.data?.pages
                    .flatMap((p) => p.items)
                    .map((d) => (
                      <TableRow key={d.id}>
                        <TableCell className="font-mono text-sm">{d.eventType}</TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              d.status === "success"
                                ? "default"
                                : d.status === "dead_letter" || d.status === "failed"
                                  ? "destructive"
                                  : "secondary"
                            }
                          >
                            {isDeliveryStatus(d.status)
                              ? t(DELIVERY_STATUS_KEYS[d.status])
                              : d.status}
                          </Badge>
                        </TableCell>
                        <TableCell>{d.attempts}</TableCell>
                        <TableCell>{formatDate(d.createdAt)}</TableCell>
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
                  disabled={deliveries.isFetchingNextPage}
                  onClick={() => void deliveries.fetchNextPage()}
                >
                  {t("settings:webhooks.deliveries.loadMore")}
                </Button>
              )}
            </>
          )}

          <DeliverySheet
            endpointId={selectedEndpointId}
            delivery={selectedDelivery}
            canReplay={can({ webhooks: ["write"] })}
            onReplay={(deliveryId) => replay.mutate({ endpointId: selectedEndpointId, deliveryId })}
            onClose={() => setSelectedDelivery(null)}
            guard={guard}
          />
        </>
      )}

      <Dialog open={dialogOpen} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editing
                ? t("settings:webhooks.editEndpointTitle")
                : t("settings:webhooks.addEndpoint")}
            </DialogTitle>
          </DialogHeader>
          <WebhookForm
            defaultValues={
              editing
                ? { url: editing.url, eventTypes: editing.eventTypes, enabled: editing.enabled }
                : { url: "", eventTypes: [], enabled: true }
            }
            submitLabel={editing ? t("common:actions.save") : t("settings:webhooks.createAction")}
            isPending={create.isPending || update.isPending}
            guard={guard}
            onSubmit={(v) => (editing ? update.mutate({ id: editing.id, ...v }) : create.mutate(v))}
          />
        </DialogContent>
      </Dialog>

      <SecretRevealDialog secret={revealSecret} onClose={() => setRevealSecret(null)} />
    </main>
  );
}
