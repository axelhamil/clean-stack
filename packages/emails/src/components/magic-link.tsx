import type { TFunction } from "i18next";
import { Button, Heading, Text } from "react-email";
import type { EmailTemplates } from "../templates";
import { EmailLayout } from "./layout";

type MagicLinkVars = EmailTemplates["magic_link"];
interface MagicLinkProps extends MagicLinkVars {
  t: TFunction<"emails">;
}

export function MagicLink({ magicUrl, t }: MagicLinkProps) {
  return (
    <EmailLayout preview={t("subjects.magicLink")}>
      <Heading as="h1">Sign in to your account</Heading>
      <Text>Click the button below to sign in. This link is single-use and expires shortly.</Text>
      <Button href={magicUrl}>Sign in</Button>
      <Text>{magicUrl}</Text>
    </EmailLayout>
  );
}
