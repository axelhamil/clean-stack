import { Alert, AlertDescription } from "@packages/ui/components/ui/alert";
import { Button } from "@packages/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@packages/ui/components/ui/card";
import { pageContainerVariants } from "@packages/ui/components/ui/page-container";
import { TypographyH1, TypographyMuted } from "@packages/ui/components/ui/typography";
import { cn } from "@packages/ui/libs/utils.js";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { formatApiError } from "../../shared/api/errors/messages";
import { sessionQueryOptions } from "../../shared/api/queries/session";
import { useAcceptInvitation } from "./hooks/use-accept-invitation";

export const Route = createFileRoute("/accept-invitation/$invitationId")({
  component: AcceptInvitationPage,
});

function AcceptInvitationPage() {
  const { t } = useTranslation("common");
  const { t: tAuth } = useTranslation("auth");
  const { t: tErrors } = useTranslation("errors");
  const { invitationId } = Route.useParams();
  const { data: session } = useQuery(sessionQueryOptions);
  const mutation = useAcceptInvitation();

  if (!session) {
    return (
      <main className={cn(pageContainerVariants({ width: "form" }), "flex flex-col gap-4 py-6")}>
        <TypographyH1>{t("invitation.signInTitle")}</TypographyH1>
        <TypographyMuted>{t("invitation.signInBody")}</TypographyMuted>
        <Button asChild>
          <Link to="/sign-in" search={{ redirect: `/accept-invitation/${invitationId}` }}>
            {tAuth("signIn.submit")}
          </Link>
        </Button>
      </main>
    );
  }

  return (
    <main className={cn(pageContainerVariants({ width: "form" }), "flex flex-col gap-6 py-6")}>
      <TypographyH1>{t("invitation.acceptInvitation")}</TypographyH1>
      <Card>
        <CardHeader>
          <CardTitle>{t("invitation.joinTitle")}</CardTitle>
          <CardDescription>
            {t("invitation.signedInAs", { email: session.user.email })}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Button onClick={() => mutation.mutate({ invitationId })} disabled={mutation.isPending}>
            {t("invitation.acceptInvitation")}
          </Button>
          {mutation.isError && (
            <Alert variant="destructive">
              <AlertDescription>
                {formatApiError(mutation.error, t("invitation.acceptFailed"), tErrors)}
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
