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
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { SecretRevealDialog } from "../../shared/components/secret-reveal-dialog";
import { createTokenMutationOptions, deleteTokenMutationOptions } from "./api/api-tokens.mutations";
import { apiTokensQueryOptions } from "./api/api-tokens.queries";
import type { TokenFormInput } from "./api-tokens.schema";
import { TokenRow } from "./components/token-row";
import { TokenForm } from "./forms/token-form";

const DEFAULT_VALUES: TokenFormInput = {
  name: "",
  scopes: [],
  organizationId: null,
  expiresInDays: null,
};

export function ApiTokensPage() {
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [revealToken, setRevealToken] = useState<string | null>(null);

  const tokens = useQuery(apiTokensQueryOptions());

  const create = useMutation({
    ...createTokenMutationOptions,
    onSuccess: (res) => {
      setRevealToken(res.token);
      setCreating(false);
      void qc.invalidateQueries({ queryKey: ["settings", "api-tokens"] });
      toast.success("Token created");
    },
    onError: (err) => toast.error(err.message),
  });

  const revoke = useMutation({
    ...deleteTokenMutationOptions,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["settings", "api-tokens"] });
      toast.success("Token revoked");
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <section className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">API tokens</h1>
        <Button onClick={() => setCreating(true)}>New token</Button>
      </div>

      {tokens.isLoading ? (
        <p>Loading…</p>
      ) : tokens.isError ? (
        <p>Failed to load API tokens.</p>
      ) : tokens.data?.items.length === 0 ? (
        <p className="text-muted-foreground">No tokens yet. Create one to get started.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Token</TableHead>
              <TableHead>Scopes</TableHead>
              <TableHead>Last used</TableHead>
              <TableHead>Expires</TableHead>
              <TableHead>Status</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {tokens.data?.items.map((token) => (
              <TokenRow
                key={token.id}
                token={token}
                onRevoke={(id) => revoke.mutate(id)}
                isRevoking={revoke.isPending}
              />
            ))}
          </TableBody>
        </Table>
      )}

      <Dialog open={creating} onOpenChange={(open) => !open && setCreating(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create API token</DialogTitle>
          </DialogHeader>
          <TokenForm
            defaultValues={DEFAULT_VALUES}
            submitLabel="Create"
            isPending={create.isPending}
            onSubmit={(v) => create.mutate(v)}
          />
        </DialogContent>
      </Dialog>

      <SecretRevealDialog
        secret={revealToken}
        onClose={() => setRevealToken(null)}
        title="API token"
        description="Copy this token now — it is shown only once and cannot be retrieved later."
      />
    </section>
  );
}
