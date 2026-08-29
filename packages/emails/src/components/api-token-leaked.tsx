import type { TFunction } from "i18next";
import { Heading, Text } from "react-email";
import type { EmailTemplates } from "../templates";
import { EmailLayout } from "./layout";

type ApiTokenLeakedVars = EmailTemplates["api_token_leaked"];
interface ApiTokenLeakedProps extends ApiTokenLeakedVars {
  t: TFunction<"emails">;
}

export function ApiTokenLeaked({ name, tokenName, revokedAt, t }: ApiTokenLeakedProps) {
  return (
    <EmailLayout preview={t("subjects.apiTokenLeaked")} t={t}>
      <Heading as="h1">{t("apiTokenLeaked.heading")}</Heading>
      <Text>{t("apiTokenLeaked.greeting", { name })}</Text>
      <Text>{t("apiTokenLeaked.body", { tokenName, revokedAt })}</Text>
      <Text>{t("apiTokenLeaked.help")}</Text>
    </EmailLayout>
  );
}
