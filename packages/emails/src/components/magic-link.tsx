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
    <EmailLayout preview={t("subjects.magicLink")} t={t}>
      <Heading as="h1">{t("magicLink.heading")}</Heading>
      <Text>{t("magicLink.body")}</Text>
      <Button href={magicUrl}>{t("magicLink.cta")}</Button>
      <Text>{magicUrl}</Text>
    </EmailLayout>
  );
}
