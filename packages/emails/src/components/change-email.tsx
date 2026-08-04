import { Button, Heading, Text } from "react-email";
import type { EmailTemplates } from "../templates";
import { EmailLayout } from "./layout";

type ChangeEmailVars = EmailTemplates["change_email"];
interface ChangeEmailProps extends ChangeEmailVars {}
export function ChangeEmail({ name, newEmail, confirmUrl }: ChangeEmailProps) {
  return (
    <EmailLayout preview="Confirm your new email address">
      <Heading as="h1">Confirm your new email</Heading>
      <Text>
        Hi {name}, confirm that you want to change your email address to {newEmail}.
      </Text>
      <Button href={confirmUrl}>Confirm new email</Button>
      <Text>{confirmUrl}</Text>
    </EmailLayout>
  );
}
