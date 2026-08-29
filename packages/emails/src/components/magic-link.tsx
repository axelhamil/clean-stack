import { Button, Heading, Text } from "react-email";
import type { EmailProps } from "../templates";
import { EmailLayout } from "./layout";

export function MagicLink({ magicUrl, t }: EmailProps<"magic_link">) {
  return (
    <EmailLayout preview={t("subjects.magicLink")} t={t}>
      <Heading as="h1">{t("magicLink.heading")}</Heading>
      <Text>{t("magicLink.body")}</Text>
      <Button href={magicUrl}>{t("magicLink.cta")}</Button>
      <Text>{magicUrl}</Text>
    </EmailLayout>
  );
}
