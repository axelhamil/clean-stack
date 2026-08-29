import { Alert, AlertDescription } from "@packages/ui/components/ui/alert";
import { Button } from "@packages/ui/components/ui/button";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { ShieldAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { stopImpersonationMutationOptions } from "../api/mutations/stop-impersonation";
import { sessionQueryOptions } from "../api/queries/session";
import { broadcastAuthChange } from "../auth/auth-broadcast";
import { isImpersonating } from "../auth/is-impersonating";
import { displayName } from "../utils";

export function ImpersonationBanner() {
  const { t } = useTranslation("common");
  const { data: session } = useQuery(sessionQueryOptions);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [now, setNow] = useState(() => Date.now());

  const mutation = useMutation({
    ...stopImpersonationMutationOptions,
    onSuccess: async () => {
      await queryClient.refetchQueries({ queryKey: sessionQueryOptions.queryKey });
      broadcastAuthChange({ identityChanged: true });
      void navigate({ to: "/admin/users" });
    },
  });

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  if (!session || !isImpersonating(session)) return null;

  const name = displayName(session.user);
  const ms = new Date(session.session.expiresAt).getTime() - now;
  const remaining =
    ms <= 0
      ? t("impersonation.expired")
      : t("impersonation.remainingMinutes", {
          minutes: Math.ceil(ms / 60000),
        });

  return (
    <Alert variant="banner">
      <ShieldAlert />
      <AlertDescription className="flex items-center justify-between gap-4">
        <span>
          <Trans
            ns="common"
            i18nKey="impersonation.activeSession"
            components={{ name: <strong>{name}</strong> }}
          />
          {`. ${remaining}`}
        </span>
        <Button
          variant="secondary"
          size="sm"
          disabled={mutation.isPending}
          onClick={() => mutation.mutate()}
        >
          {t("impersonation.end")}
        </Button>
      </AlertDescription>
    </Alert>
  );
}
