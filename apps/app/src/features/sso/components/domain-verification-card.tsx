import { Badge } from "@packages/ui/components/ui/badge";
import { Button } from "@packages/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@packages/ui/components/ui/card";
import { TypographyMuted } from "@packages/ui/components/ui/typography";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { activeOrgQueryOptions } from "../../../shared/api/queries/active-org";
import { verifyDomainMutationOptions } from "../api/sso.mutations";
import {
  domainVerificationTokenQueryOptions,
  primaryProviderFor,
  ssoProvidersQueryOptions,
} from "../api/sso.queries";
import { CopyRow } from "./copy-row";

export function DomainVerificationCard() {
  const qc = useQueryClient();
  const { data: org } = useQuery(activeOrgQueryOptions);
  const { data: providers } = useQuery(ssoProvidersQueryOptions);
  const provider = primaryProviderFor(providers, org?.id);

  const token = useQuery({
    ...domainVerificationTokenQueryOptions(provider?.providerId ?? ""),
    enabled: Boolean(provider) && provider?.domainVerified === false,
  });

  const verify = useMutation({
    ...verifyDomainMutationOptions,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ssoProvidersQueryOptions.queryKey });
      toast.success("Domain verified");
    },
    onError: (err) =>
      toast.error(
        err.message === "DOMAIN_VERIFIED"
          ? "This domain is already verified."
          : "Verification failed — the DNS record was not found. DNS changes can take a while to propagate.",
      ),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Domain verification</CardTitle>
        <CardDescription>
          Prove you control the domain by publishing a TXT record. The provider stays inactive —
          members on that domain cannot sign in through it — until the record resolves.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {!provider ? (
          <TypographyMuted>Register an identity provider first.</TypographyMuted>
        ) : provider.domainVerified ? (
          <Badge>Verified</Badge>
        ) : (
          <>
            <Badge variant="secondary">Unverified</Badge>
            {token.data && (
              <div className="flex flex-col gap-3">
                <CopyRow
                  label="TXT record name"
                  value={`_better-auth-token-${provider.providerId}.${provider.domain}`}
                />
                <CopyRow label="TXT record value" value={token.data} />
              </div>
            )}
            <Button
              variant="outline"
              className="w-fit"
              disabled={verify.isPending}
              onClick={() => verify.mutate(provider.providerId)}
            >
              Check now
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
