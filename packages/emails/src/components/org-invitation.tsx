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
    <EmailLayout preview={t("subjects.orgInvitation", { orgName })}>
      <Heading as="h1">You have been invited</Heading>
      <Text>
        {inviterName} has invited you to join <strong>{orgName}</strong> as a {role}.
      </Text>
      <Button href={inviteUrl}>Accept invitation</Button>
      <Text>{inviteUrl}</Text>
    </EmailLayout>
  );
}
