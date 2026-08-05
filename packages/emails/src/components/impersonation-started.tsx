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
    <EmailLayout preview="Support access to your account">
      <Heading as="h1">Support access to your account</Heading>
      <Text>
        Hi {userName}, a member of our support team accessed your account for diagnostic purposes on{" "}
        {startedAt}. This access will automatically expire on {expiresAt}.
      </Text>
      <Text>Stated reason: {reason}</Text>
      <Text>
        This access is time-limited and does not allow changes to your password, payment details, or
        login credentials.
      </Text>
      <Text>
        If you did not contact our support team or have any concerns about this access, please reach
        out to us immediately.
      </Text>
      <Button href={supportUrl}>Contact support</Button>
      <Text>{supportUrl}</Text>
    </EmailLayout>
  );
}
