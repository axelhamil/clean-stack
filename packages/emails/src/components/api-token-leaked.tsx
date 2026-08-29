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
    <EmailLayout preview={t("subjects.apiTokenLeaked")}>
      <Heading as="h1">API token revoked</Heading>
      <Text>Hi {name},</Text>
      <Text>
        Your API token <strong>{tokenName}</strong> was detected in a public repository and has been
        automatically revoked on {revokedAt} to protect your account.
      </Text>
      <Text>
        If you believe this was a mistake or need to regenerate the token, you can do so in your
        account settings.
      </Text>
    </EmailLayout>
  );
}
