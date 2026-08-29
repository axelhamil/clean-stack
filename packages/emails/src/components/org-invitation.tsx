import { Button, Heading, Text } from "react-email";
import { Trans } from "react-i18next";
import type { EmailProps } from "../templates";
import { EmailLayout } from "./layout";

export function OrgInvitation({
  inviterName,
  orgName,
  role,
  inviteUrl,
  t,
}: EmailProps<"org_invitation">) {
  return (
    <EmailLayout preview={t("subjects.orgInvitation", { orgName })} t={t}>
      <Heading as="h1">{t("orgInvitation.heading")}</Heading>
      <Text>
        <Trans
          t={t}
          i18nKey="orgInvitation.body"
          values={{ inviterName, orgName, role }}
          components={{ org: <strong /> }}
        />
      </Text>
      <Button href={inviteUrl}>{t("orgInvitation.cta")}</Button>
      <Text>{inviteUrl}</Text>
    </EmailLayout>
  );
}
