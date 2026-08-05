import { Alert, AlertDescription } from "@packages/ui/components/ui/alert";
import { Button } from "@packages/ui/components/ui/button";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { ShieldAlert } from "lucide-react";
import { stopImpersonationMutationOptions } from "../api/mutations/stop-impersonation";
import { sessionQueryOptions } from "../api/queries/session";
import { broadcastAuthChange } from "../auth/auth-broadcast";
import { isImpersonating } from "../auth/is-impersonating";

export function ImpersonationBanner() {
  const { data: session } = useQuery(sessionQueryOptions);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const mutation = useMutation({
    ...stopImpersonationMutationOptions,
    onSuccess: async () => {
      await queryClient.refetchQueries({ queryKey: sessionQueryOptions.queryKey });
      broadcastAuthChange();
      void navigate({ to: "/admin/users" });
    },
  });

  if (!isImpersonating(session)) return null;

  const user = session?.user as { name?: string | null; email?: string } | undefined;
  const displayName = user?.name ?? user?.email ?? "utilisateur inconnu";

  return (
    <Alert variant="destructive" className="rounded-none border-x-0">
      <ShieldAlert />
      <AlertDescription className="flex items-center justify-between gap-4">
        <span>
          Session d'impersonation active — vous agissez en tant que <strong>{displayName}</strong>
          {"."}
        </span>
        <Button
          variant="destructive"
          size="sm"
          disabled={mutation.isPending}
          onClick={() => mutation.mutate()}
        >
          Quitter l'impersonation
        </Button>
      </AlertDescription>
    </Alert>
  );
}
