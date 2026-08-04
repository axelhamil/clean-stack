import { Button, Heading, Text } from "@react-email/components";
import type { EmailTemplates } from "../templates";
import { EmailLayout } from "./layout";

export function MagicLink({ magicUrl }: EmailTemplates["magic_link"]) {
  return (
    <EmailLayout preview="Your sign-in link">
      <Heading as="h1">Sign in to your account</Heading>
      <Text>Click the button below to sign in. This link is single-use and expires shortly.</Text>
      <Button href={magicUrl}>Sign in</Button>
      <Text>{magicUrl}</Text>
    </EmailLayout>
  );
}
