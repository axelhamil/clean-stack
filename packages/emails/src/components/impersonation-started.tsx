import { Button, Heading, Text } from "react-email";
import type { EmailTemplates } from "../templates";
import { EmailLayout } from "./layout";

type ImpersonationStartedVars = EmailTemplates["impersonation_started"];
interface ImpersonationStartedProps extends ImpersonationStartedVars {}

export function ImpersonationStarted({
  userName,
  startedAt,
  expiresAt,
  reason,
  supportUrl,
}: ImpersonationStartedProps) {
  return (
    <EmailLayout preview="Accès support à votre compte">
      <Heading as="h1">Accès support à votre compte</Heading>
      <Text>Bonjour {userName},</Text>
      <Text>
        Un membre de notre équipe de support a accédé à votre compte à titre de diagnostic, le{" "}
        {startedAt}. Cet accès expirera automatiquement le {expiresAt}.
      </Text>
      <Text>Motif indiqué : {reason}</Text>
      <Text>
        Cet accès est limité dans le temps et ne permet pas de modifier votre mot de passe, vos
        données de paiement ni vos informations de connexion.
      </Text>
      <Text>
        Si vous n'avez pas sollicité notre support ou si vous avez le moindre doute sur cet accès,
        contactez-nous immédiatement.
      </Text>
      <Button href={supportUrl}>Contacter le support</Button>
      <Text>{supportUrl}</Text>
    </EmailLayout>
  );
}
