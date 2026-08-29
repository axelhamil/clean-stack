import type { TFunction } from "i18next";
import { Button, Heading, Text } from "react-email";
import type { EmailTemplates } from "../templates";
import { EmailLayout } from "./layout";

type OrgInvitationVars = EmailTemplates["org_invitation"];
interface OrgInvitationProps extends OrgInvitationVars {
  t: TFunction<"emails">;
}

export function OrgInvitation({ inviterName, orgName, role, inviteUrl, t }: OrgInvitationProps) {
  return (
    <EmailLayout preview={t("subjects.orgInvitation", { orgName })} t={t}>
      <Heading as="h1">{t("orgInvitation.heading")}</Heading>
      <Text>{t("orgInvitation.body", { inviterName, orgName, role })}</Text>
      <Button href={inviteUrl}>{t("orgInvitation.cta")}</Button>
      <Text>{inviteUrl}</Text>
    </EmailLayout>
  );
}
