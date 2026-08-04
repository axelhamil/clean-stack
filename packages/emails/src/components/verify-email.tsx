import { Button, Heading, Text } from "react-email";
import type { EmailTemplates } from "../templates";
import { EmailLayout } from "./layout";

type VerifyEmailVars = EmailTemplates["verify_email"];
interface VerifyEmailProps extends VerifyEmailVars {}
export function VerifyEmail({ name, verifyUrl }: VerifyEmailProps) {
  return (
    <EmailLayout preview="Confirm your email address">
      <Heading as="h1">Confirm your email</Heading>
      <Text>Hi {name}, confirm your address to finish setting up your account.</Text>
      <Button href={verifyUrl}>Confirm email</Button>
      <Text>{verifyUrl}</Text>
    </EmailLayout>
  );
}
