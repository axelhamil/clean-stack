import { Alert, AlertDescription } from "@packages/ui/components/ui/alert";
import { Button } from "@packages/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@packages/ui/components/ui/card";
import { TypographyH1, TypographyMuted } from "@packages/ui/components/ui/typography";
import { useQuery } from "@tanstack/react-query";
import { createRoute, Link } from "@tanstack/react-router";
import { rootRoute } from "../../router/layouts";
import { sessionQueryOptions } from "../../shared/api/queries/session";
import { useAcceptInvitation } from "./hooks/use-accept-invitation";

export const acceptInvitationRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "accept-invitation/$invitationId",
  component: AcceptInvitationPage,
});

function AcceptInvitationPage() {
  const { invitationId } = acceptInvitationRoute.useParams();
  const { data: session } = useQuery(sessionQueryOptions);
  const mutation = useAcceptInvitation();

  if (!session) {
    return (
      <main className="mx-auto flex max-w-md flex-col gap-4 p-6">
        <TypographyH1>Sign in to accept</TypographyH1>
        <TypographyMuted>You need to be signed in to accept this invitation.</TypographyMuted>
        <Button asChild>
          <Link to="/sign-in" search={{ redirect: `/accept-invitation/${invitationId}` }}>
            Sign in
          </Link>
        </Button>
      </main>
    );
  }

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
          <Button onClick={() => mutation.mutate({ invitationId })} disabled={mutation.isPending}>
            Accept invitation
          </Button>
          {mutation.isError && (
            <Alert variant="destructive">
              <AlertDescription>{mutation.error.message}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
