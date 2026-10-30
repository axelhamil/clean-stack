import { Alert, AlertDescription } from "@packages/ui/components/ui/alert";
import { Button } from "@packages/ui/components/ui/button";
import { LoadErrorAlert } from "@packages/ui/components/ui/load-error-alert";
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

const pageClassName = cn(pageContainerVariants({ width: "form" }), "flex flex-col gap-4 py-12");

function AcceptInvitationPage() {
  const { t } = useTranslation("common");
  const { t: tAuth } = useTranslation("auth");
  const { t: tErrors } = useTranslation("errors");
  const { invitationId } = Route.useParams();
  const { data: session, isPending, isError, isFetching, refetch } = useQuery(sessionQueryOptions);
  const mutation = useAcceptInvitation();

  if (isPending) {
    return (
      <main className={pageClassName}>
        <TypographyH1 variant="page">{t("invitation.joinTitle")}</TypographyH1>
      </main>
    );
  }

  if (isError && !session) {
    return (
      <main className={pageClassName}>
        <TypographyH1 variant="page">{t("invitation.joinTitle")}</TypographyH1>
        <LoadErrorAlert
          message={tErrors("fallback.loadSession")}
          retry={
            <Button
              variant="outline"
              size="sm"
              disabled={isFetching}
              onClick={() => void refetch()}
            >
              {t("actions.retry")}
            </Button>
          }
        />
      </main>
    );
  }

  if (!session) {
    const redirect = `/accept-invitation/${invitationId}`;

    return (
      <main className={pageClassName}>
        <TypographyH1 variant="page">{t("invitation.signInTitle")}</TypographyH1>
        <TypographyMuted>{t("invitation.signInBody")}</TypographyMuted>
        <Button asChild>
          <Link to="/sign-in" search={{ redirect }}>
            {tAuth("signIn.submit")}
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link to="/sign-up" search={{ redirect }}>
            {t("invitation.createAccount")}
          </Link>
        </Button>
      </main>
    );
  }

  return (
    <main className={pageClassName}>
      <TypographyH1 variant="page">{t("invitation.joinTitle")}</TypographyH1>
      <TypographyMuted>{t("invitation.signedInAs", { email: session.user.email })}</TypographyMuted>
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
    </main>
  );
}
