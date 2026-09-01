import { Button } from "@packages/ui/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@packages/ui/components/ui/dialog";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@packages/ui/components/ui/table";
import { TypographyH1 } from "@packages/ui/components/ui/typography";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { toastError } from "../../shared/api/errors/toast";
import { activeOrgQueryOptions } from "../../shared/api/queries/active-org";
import { ImpersonationReason } from "../../shared/auth/impersonation-reason";
import { useActiveOrgId } from "../../shared/auth/use-active-org-id";
import { useImpersonationGuard } from "../../shared/auth/use-impersonation-guard";
import { SecretRevealDialog } from "../../shared/components/secret-reveal-dialog";
import { getErrorsT } from "../../shared/i18n/get-errors-t";
import { createTokenMutationOptions, deleteTokenMutationOptions } from "./api/api-tokens.mutations";
import { apiTokensQueryOptions } from "./api/api-tokens.queries";
import type { TokenFormInput } from "./api-tokens.schema";
import { TokenRow } from "./components/token-row";
import { TokenForm } from "./forms/token-form";

export const Route = createFileRoute("/_protected/_shell/settings/api-tokens")({
  component: ApiTokensPage,
});

const DEFAULT_VALUES: TokenFormInput = {
  name: "",
  scopes: [],
  organizationId: null,
  expiresInDays: null,
};

function ApiTokensPage() {
  const { t } = useTranslation("settings");
  const qc = useQueryClient();
  const guard = useImpersonationGuard();
  const [creating, setCreating] = useState(false);
  const [revealToken, setRevealToken] = useState<string | null>(null);

  const organizationId = useActiveOrgId();
  const tokens = useQuery(apiTokensQueryOptions(organizationId));
  // The list mixes the active organization's tokens with the caller's personal
  // ones, so each row needs the organization's name to say which is which.
  const { data: activeOrg } = useQuery(activeOrgQueryOptions);

  const create = useMutation({
    ...createTokenMutationOptions,
    onSuccess: (res) => {
      setRevealToken(res.token);
      setCreating(false);
      void qc.invalidateQueries({ queryKey: apiTokensQueryOptions(organizationId).queryKey });
      toast.success(t("apiTokens.createdToast"));
    },
    onError: (err) =>
      toastError(
        err,
        getErrorsT()("fallback.createApiToken", { defaultValue: "Failed to create API token" }),
      ),
  });

  const revoke = useMutation({
    ...deleteTokenMutationOptions,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: apiTokensQueryOptions(organizationId).queryKey });
      toast.success(t("apiTokens.revokedToast"));
    },
    onError: (err) =>
      toastError(
        err,
        getErrorsT()("fallback.revokeApiToken", { defaultValue: "Failed to revoke API token" }),
      ),
  });

  return (
    <main className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <TypographyH1>{t("apiTokens.pageTitle")}</TypographyH1>
        <Button
          onClick={() => setCreating(true)}
          disabled={guard.blocked}
          {...guard.describeProps()}
        >
          {t("apiTokens.newTokenAction")}
        </Button>
      </div>
      <ImpersonationReason guard={guard} />

      {tokens.isLoading ? (
        <p>{t("apiTokens.loading")}</p>
      ) : tokens.isError ? (
        <p>{t("apiTokens.loadFailed")}</p>
      ) : tokens.data?.items.length === 0 ? (
        <p className="text-muted-foreground">{t("apiTokens.empty")}</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("apiTokens.table.nameHeader")}</TableHead>
              <TableHead>{t("apiTokens.table.tokenHeader")}</TableHead>
              <TableHead>{t("apiTokens.table.tokenScopeHeader")}</TableHead>
              <TableHead>{t("apiTokens.table.scopesHeader")}</TableHead>
              <TableHead>{t("apiTokens.table.lastUsedHeader")}</TableHead>
              <TableHead>{t("apiTokens.table.expiresHeader")}</TableHead>
              <TableHead>{t("apiTokens.table.statusHeader")}</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {tokens.data?.items.map((token) => (
              <TokenRow
                key={token.id}
                token={token}
                activeOrg={activeOrg}
                onRevoke={(id) => revoke.mutate(id)}
                isRevoking={revoke.isPending && revoke.variables === token.id}
                guard={guard}
              />
            ))}
          </TableBody>
        </Table>
      )}

      <Dialog open={creating} onOpenChange={(open) => !open && setCreating(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("apiTokens.createDialogTitle")}</DialogTitle>
          </DialogHeader>
          <TokenForm
            defaultValues={DEFAULT_VALUES}
            submitLabel={t("apiTokens.createAction")}
            isPending={create.isPending}
            guard={guard}
            onSubmit={(v) => create.mutate(v)}
          />
        </DialogContent>
      </Dialog>

      <SecretRevealDialog
        secret={revealToken}
        onClose={() => setRevealToken(null)}
        title={t("apiTokens.secretDialogTitle")}
      />
    </main>
  );
}
