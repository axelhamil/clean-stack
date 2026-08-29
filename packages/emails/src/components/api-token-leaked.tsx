import { Heading, Text } from "react-email";
import { Trans } from "react-i18next";
import type { EmailProps } from "../templates";
import { EmailLayout } from "./layout";

export function ApiTokenLeaked({ name, tokenName, revokedAt, t }: EmailProps<"api_token_leaked">) {
  return (
    <EmailLayout preview={t("subjects.apiTokenLeaked")} t={t}>
      <Heading as="h1">{t("apiTokenLeaked.heading")}</Heading>
      <Text>{t("apiTokenLeaked.greeting", { name })}</Text>
      <Text>
        <Trans
          t={t}
          i18nKey="apiTokenLeaked.body"
          values={{ tokenName, revokedAt }}
          components={{ token: <strong /> }}
        />
      </Text>
      <Text>{t("apiTokenLeaked.help")}</Text>
    </EmailLayout>
  );
}
