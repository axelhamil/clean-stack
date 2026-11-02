import { Button } from "@packages/ui/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@packages/ui/components/ui/dialog";
import { LoadErrorAlert } from "@packages/ui/components/ui/load-error-alert";
import { NavLink } from "@packages/ui/components/ui/nav-link";
import { PageHeader } from "@packages/ui/components/ui/page-header";
import { Separator } from "@packages/ui/components/ui/separator";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@packages/ui/components/ui/table";
import { TypographyMuted } from "@packages/ui/components/ui/typography";
import { toastError } from "@packages/web-kit/api/errors/toast";
import { errorFallback } from "@packages/web-kit/i18n/get-errors-t";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Can } from "../../shared/auth/can";
import { ensureOrgPermission } from "../../shared/auth/ensure-org-permission";
import { GuardHint } from "../../shared/auth/guard-hint";
import { ImpersonationReason } from "../../shared/auth/impersonation-reason";
import { useActiveOrgId } from "../../shared/auth/use-active-org-id";
import { useAuthorization } from "../../shared/auth/use-authorization";
import { useImpersonationGuard } from "../../shared/auth/use-impersonation-guard";
import { SecretRevealDialog } from "../../shared/components/secret-reveal-dialog";
import {
  createEndpointMutationOptions,
  deleteEndpointMutationOptions,
  rotateSecretMutationOptions,
  sendTestMutationOptions,
  updateEndpointMutationOptions,
} from "./api/webhooks.mutations";
import type { WebhookEndpoint } from "./api/webhooks.queries";
import { webhookEndpointsQueryOptions } from "./api/webhooks.queries";
import { DeliveriesSection } from "./components/deliveries-section";
import { EndpointRow } from "./components/endpoint-row";
import { VerifySnippet } from "./components/verify-snippet";
import { WebhookForm } from "./forms/webhook-form";

export const Route = createFileRoute("/_protected/_shell/settings/_org-scope/webhooks")({
  beforeLoad: ensureOrgPermission({ webhooks: ["read"] }),
  component: WebhooksPage,
});

function WebhooksPage() {
  const { t } = useTranslation(["settings", "common", "errors"]);
  const qc = useQueryClient();
  const { can } = useAuthorization();
  const canWrite = can({ webhooks: ["write"] });
  const guard = useImpersonationGuard();

  const [selectedEndpointId, setSelectedEndpointId] = useState<string | null>(null);
  const [editing, setEditing] = useState<WebhookEndpoint | null>(null);
  const [creating, setCreating] = useState(false);
  const [revealSecret, setRevealSecret] = useState<string | null>(null);

  const organizationId = useActiveOrgId();
  const endpoints = useQuery(webhookEndpointsQueryOptions(organizationId));

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
    onError: (err) => toastError(err, errorFallback("createWebhookEndpoint")),
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
    onError: (err) => toastError(err, errorFallback("updateWebhookEndpoint")),
  });

  const del = useMutation({
    ...deleteEndpointMutationOptions,
    onSuccess: () => {
      void qc.invalidateQueries({
        queryKey: webhookEndpointsQueryOptions(organizationId).queryKey,
      });
      toast.success(t("settings:webhooks.deletedToast"));
    },
    onError: (err) => toastError(err, errorFallback("deleteWebhookEndpoint")),
  });

  const rotate = useMutation({
    ...rotateSecretMutationOptions,
    onSuccess: (res) => {
      setRevealSecret(res.secret);
      toast.success(t("settings:webhooks.secretRotatedToast"));
    },
    onError: (err) => toastError(err, errorFallback("rotateWebhookSecret")),
  });

  const sendTest = useMutation({
    ...sendTestMutationOptions,
    onSuccess: () => toast.success(t("settings:webhooks.testSentToast")),
    onError: (err) => toastError(err, errorFallback("sendWebhookTestEvent")),
  });

  const dialogOpen = creating || editing !== null;

  const closeDialog = () => {
    setCreating(false);
    setEditing(null);
  };

  return (
    <main className="flex flex-col gap-6">
      <PageHeader
        title={t("settings:webhooks.pageTitle")}
        description={
          <NavLink variant="plain" asChild>
            <Link to="/developers/events">{t("settings:webhooks.viewEventCatalog")}</Link>
          </NavLink>
        }
        actions={
          <Can requires={{ webhooks: ["write"] }}>
            <GuardHint guard={guard}>
              <Button
                onClick={() => setCreating(true)}
                disabled={guard.blocked}
                {...guard.describeProps()}
              >
                {t("settings:webhooks.addEndpoint")}
              </Button>
            </GuardHint>
          </Can>
        }
      />
      <ImpersonationReason guard={guard} />

      {endpoints.isPending ? (
        <TypographyMuted role="status">{t("settings:webhooks.loading")}</TypographyMuted>
      ) : endpoints.isLoadingError ? (
        <LoadErrorAlert message={t("errors:fallback.loadWebhookEndpoints")} />
      ) : endpoints.data.items.length === 0 ? (
        <TypographyMuted>{t("settings:webhooks.noEndpoints")}</TypographyMuted>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("settings:webhooks.endpointsTable.urlHeader")}</TableHead>
              <TableHead>{t("settings:webhooks.endpointsTable.statusHeader")}</TableHead>
              <TableHead className="hidden sm:table-cell">
                {t("settings:webhooks.endpointsTable.eventsHeader")}
              </TableHead>
              <TableHead className="hidden sm:table-cell">
                {t("settings:webhooks.endpointsTable.createdHeader")}
              </TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {endpoints.data.items.map((e) => (
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

      {selectedEndpointId !== null && (
        <>
          <Separator />
          <DeliveriesSection endpointId={selectedEndpointId} canWrite={canWrite} guard={guard} />
        </>
      )}

      <Separator />
      <VerifySnippet />

      <Dialog open={dialogOpen} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent closeLabel={t("common:actions.close")} className="sm:max-w-2xl">
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
