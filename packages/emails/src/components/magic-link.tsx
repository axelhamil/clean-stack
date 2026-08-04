import { Button, Heading, Text } from "react-email";
import type { EmailTemplates } from "../templates";
import { EmailLayout } from "./layout";

type MagicLinkVars = EmailTemplates["magic_link"];
interface MagicLinkProps extends MagicLinkVars {}
export function MagicLink({ magicUrl }: MagicLinkProps) {
  return (
    <EmailLayout preview="Your sign-in link">
      <Heading as="h1">Sign in to your account</Heading>
      <Text>Click the button below to sign in. This link is single-use and expires shortly.</Text>
      <Button href={magicUrl}>Sign in</Button>
      <Text>{magicUrl}</Text>
    </EmailLayout>
  );
}
