import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@packages/ui/components/ui/card";
import { Switch } from "@packages/ui/components/ui/switch";
import { TypographyMuted } from "@packages/ui/components/ui/typography";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { activeOrgQueryOptions } from "../../../shared/api/queries/active-org";
import { Can } from "../../../shared/auth/can";
import { setSsoEnforcementMutationOptions } from "../api/sso.mutations";
import { ssoProvidersQueryOptions } from "../api/sso.queries";

// `ssoEnforced` is a server-only additionalField on the organization schema
// (apps/api/src/auth.ts) — the organization client isn't generated with knowledge
// of it, so it has to be read through a narrow, explicit cast.
interface OrgWithSsoEnforcement {
  ssoEnforced?: boolean;
}

export function SsoEnforcementCard() {
  const qc = useQueryClient();
  const { data: org } = useQuery(activeOrgQueryOptions);
  const { data: providers } = useQuery(ssoProvidersQueryOptions);
  const provider = providers?.find((p) => p.organizationId === org?.id);
  const hasVerifiedProvider = provider?.domainVerified === true;
  const enforced = (org as OrgWithSsoEnforcement | undefined)?.ssoEnforced ?? false;

  const setEnforcement = useMutation({
    ...setSsoEnforcementMutationOptions,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: activeOrgQueryOptions.queryKey });
      toast.success("SSO enforcement updated");
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <Can requires={{ organization: ["update"] }}>
      <Card>
        <CardHeader>
          <CardTitle>Enforce SSO</CardTitle>
          <CardDescription>
            When enabled, members on your verified domain can no longer sign in with a password, a
            magic link, or a passkey — SSO through your identity provider becomes the only way in.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <Switch
              aria-label="Enforce SSO for your domain"
              checked={enforced}
              disabled={setEnforcement.isPending || (!enforced && !hasVerifiedProvider)}
              onCheckedChange={(next) => setEnforcement.mutate(next)}
            />
            <span className="text-sm">{enforced ? "Enforced" : "Not enforced"}</span>
          </div>
          {!enforced && !hasVerifiedProvider && (
            <TypographyMuted>
              Verify your domain before enforcing SSO — otherwise nobody on it will be able to sign
              in at all.
            </TypographyMuted>
          )}
        </CardContent>
      </Card>
    </Can>
  );
}
