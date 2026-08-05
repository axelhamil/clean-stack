import { Alert, AlertDescription } from "@packages/ui/components/ui/alert";
import { Button } from "@packages/ui/components/ui/button";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { ShieldAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { stopImpersonationMutationOptions } from "../api/mutations/stop-impersonation";
import { sessionQueryOptions } from "../api/queries/session";
import { broadcastAuthChange } from "../auth/auth-broadcast";
import { isImpersonating } from "../auth/is-impersonating";
import { displayName } from "../utils";

function formatRemainingTime(expiresAt: Date, now: number): string {
  const ms = new Date(expiresAt).getTime() - now;
  if (ms <= 0) return "session expirée";
  const minutes = Math.ceil(ms / 60000);
  return `${minutes} min restante${minutes > 1 ? "s" : ""}`;
}

export function ImpersonationBanner() {
  const { data: session } = useQuery(sessionQueryOptions);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [now, setNow] = useState(() => Date.now());

  const mutation = useMutation({
    ...stopImpersonationMutationOptions,
    onSuccess: async () => {
      await queryClient.refetchQueries({ queryKey: sessionQueryOptions.queryKey });
      broadcastAuthChange();
      void navigate({ to: "/admin/users" });
    },
  });

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  if (!session || !isImpersonating(session)) return null;

  const name = displayName(session.user);

  return (
    <Alert variant="banner">
      <ShieldAlert />
      <AlertDescription className="flex items-center justify-between gap-4">
        <span>
          Session d'impersonation active — vous agissez en tant que <strong>{name}</strong>
          {`. ${formatRemainingTime(session.session.expiresAt, now)}`}
        </span>
        <Button
          variant="secondary"
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
