import { Button } from "@packages/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@packages/ui/components/ui/card";
import { TypographyH1 } from "@packages/ui/components/ui/typography";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { broadcastAuthChange } from "../../adapters/auth-broadcast";
import { acceptInvitationMutationOptions } from "../../adapters/mutations/accept-invitation";
import { setActiveOrgMutationOptions } from "../../adapters/mutations/set-active-org";
import { activeOrgQueryOptions } from "../../adapters/queries/active-org";
import { orgsListQueryOptions } from "../../adapters/queries/orgs-list";
import { sessionQueryOptions } from "../../adapters/queries/session";

export interface AcceptInvitationPageProps {
  invitationId: string;
}

export function AcceptInvitationPage({ invitationId }: AcceptInvitationPageProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: session } = useQuery(sessionQueryOptions);
  const accept = useMutation(acceptInvitationMutationOptions);
  const setActive = useMutation(setActiveOrgMutationOptions);
  const [error, setError] = useState<string | null>(null);

  if (!session) {
    return (
      <main className="mx-auto flex max-w-md flex-col gap-4 p-6">
        <TypographyH1>Sign in to accept</TypographyH1>
        <p className="text-muted-foreground">You need to be signed in to accept this invitation.</p>
        <Button asChild>
          <Link to="/sign-in" search={{ redirect: `/accept-invitation/${invitationId}` }}>
            Sign in
          </Link>
        </Button>
      </main>
    );
  }

  const onAccept = async () => {
    setError(null);
    try {
      const data = await accept.mutateAsync({ invitationId });
      const orgId =
        (data && "invitation" in data && data.invitation?.organizationId) ||
        (data && "organizationId" in data && (data as { organizationId?: string }).organizationId);
      if (orgId) {
        await setActive.mutateAsync({ organizationId: orgId });
      }
      await Promise.all([
        queryClient.refetchQueries({ queryKey: orgsListQueryOptions.queryKey }),
        queryClient.refetchQueries({ queryKey: activeOrgQueryOptions.queryKey }),
      ]);
      broadcastAuthChange();
      toast.success("Invitation accepted");
      void navigate({ to: "/dashboard" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to accept invitation");
    }
  };

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 p-6">
      <TypographyH1>Accept invitation</TypographyH1>
      <Card>
        <CardHeader>
          <CardTitle>Join the organization</CardTitle>
          <CardDescription>
            Signed in as {session.user.email}. If this is the wrong account, sign out and sign back
            in with the invited email.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Button
            onClick={() => void onAccept()}
            disabled={accept.isPending || setActive.isPending}
          >
            Accept invitation
          </Button>
          {error && <p className="text-destructive text-sm">{error}</p>}
        </CardContent>
      </Card>
    </main>
  );
}
