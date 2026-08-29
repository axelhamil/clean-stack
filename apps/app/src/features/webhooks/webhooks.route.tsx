import { Badge } from "@packages/ui/components/ui/badge";
import { Button } from "@packages/ui/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@packages/ui/components/ui/dialog";
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
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Can } from "../../shared/auth/can";
import { ensureOrgPermission } from "../../shared/auth/ensure-org-permission";
import { useAuthorization } from "../../shared/auth/use-authorization";
import { SecretRevealDialog } from "../../shared/components/secret-reveal-dialog";
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

export const Route = createFileRoute("/_protected/_shell/settings/_org-scope/webhooks")({
  beforeLoad: ensureOrgPermission({ webhooks: ["read"] }),
  component: WebhooksPage,
});

function WebhooksPage() {
  const formatDate = useFormatDate();
  const qc = useQueryClient();
  const { can } = useAuthorization();
  const canWrite = can({ webhooks: ["write"] });

  const [selectedEndpointId, setSelectedEndpointId] = useState<string | null>(null);
  const [editing, setEditing] = useState<WebhookEndpoint | null>(null);
  const [creating, setCreating] = useState(false);
  const [revealSecret, setRevealSecret] = useState<string | null>(null);
  const [selectedDelivery, setSelectedDelivery] = useState<DeliveryListItem | null>(null);
  const [deliveryFilters, setDeliveryFilters] = useState<DeliveryFilters>({});

  const endpoints = useQuery(webhookEndpointsQueryOptions());

  const deliveries = useInfiniteQuery({
    ...webhookDeliveriesInfiniteQueryOptions(selectedEndpointId ?? "", deliveryFilters),
    enabled: selectedEndpointId !== null,
  });

  const create = useMutation({
    ...createEndpointMutationOptions,
    onSuccess: (res) => {
      setRevealSecret(res.secret);
      setCreating(false);
      void qc.invalidateQueries({ queryKey: ["settings", "webhooks", "endpoints"] });
      toast.success("Endpoint created");
    },
    onError: (err) => toast.error(err.message),
  });

  const update = useMutation({
    ...updateEndpointMutationOptions,
    onSuccess: () => {
      setEditing(null);
      void qc.invalidateQueries({ queryKey: ["settings", "webhooks", "endpoints"] });
      toast.success("Endpoint updated");
    },
    onError: (err) => toast.error(err.message),
  });

  const del = useMutation({
    ...deleteEndpointMutationOptions,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["settings", "webhooks", "endpoints"] });
      toast.success("Endpoint deleted");
    },
    onError: (err) => toast.error(err.message),
  });

  const rotate = useMutation({
    ...rotateSecretMutationOptions,
    onSuccess: (res) => {
      setRevealSecret(res.secret);
      toast.success("Secret rotated");
    },
    onError: (err) => toast.error(err.message),
  });

  const sendTest = useMutation({
    ...sendTestMutationOptions,
    onSuccess: () => toast.success("Test event sent"),
    onError: (err) => toast.error(err.message),
  });

  const replay = useMutation({
    ...replayDeliveryMutationOptions,
    onSuccess: () => toast.success("Delivery replayed"),
    onError: (err) => toast.error(err.message),
  });

  const dialogOpen = creating || editing !== null;

  const closeDialog = () => {
    setCreating(false);
    setEditing(null);
  };

  return (
    <section className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-10">
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold">Webhooks</h1>
          <Link
            to="/developers/events"
            className="text-sm text-muted-foreground underline-offset-4 hover:underline"
          >
            View event catalog
          </Link>
        </div>
        <Can requires={{ webhooks: ["write"] }}>
          <Button onClick={() => setCreating(true)}>Add endpoint</Button>
        </Can>
      </div>

      {endpoints.isLoading ? (
        <p>Loading…</p>
      ) : endpoints.isError ? (
        <p>Failed to load webhook endpoints.</p>
      ) : endpoints.data?.items.length === 0 ? (
        <p className="text-muted-foreground">No endpoints configured yet.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>URL</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Events</TableHead>
              <TableHead>Created</TableHead>
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
              />
            ))}
          </TableBody>
        </Table>
      )}

      <VerifySnippet />

      {selectedEndpointId !== null && (
        <>
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-medium">Deliveries</h2>
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
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="success">Success</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
                <SelectItem value="dead_letter">Dead letter</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {deliveries.isLoading ? (
            <p>Loading deliveries…</p>
          ) : deliveries.isError ? (
            <p>Failed to load deliveries.</p>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Event type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Attempts</TableHead>
                    <TableHead>Created</TableHead>
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
                            {d.status}
                          </Badge>
                        </TableCell>
                        <TableCell>{d.attempts}</TableCell>
                        <TableCell>{formatDate(d.createdAt)}</TableCell>
                        <TableCell>
                          <Button variant="ghost" size="sm" onClick={() => setSelectedDelivery(d)}>
                            Details
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
                  Load more
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
          />
        </>
      )}

      <Dialog open={dialogOpen} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit endpoint" : "Add endpoint"}</DialogTitle>
          </DialogHeader>
          <WebhookForm
            defaultValues={
              editing
                ? { url: editing.url, eventTypes: editing.eventTypes, enabled: editing.enabled }
                : { url: "", eventTypes: [], enabled: true }
            }
            submitLabel={editing ? "Save" : "Create"}
            isPending={create.isPending || update.isPending}
            onSubmit={(v) => (editing ? update.mutate({ id: editing.id, ...v }) : create.mutate(v))}
          />
        </DialogContent>
      </Dialog>

      <SecretRevealDialog secret={revealSecret} onClose={() => setRevealSecret(null)} />
    </section>
  );
}
