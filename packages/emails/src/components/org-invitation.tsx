import { Button, Heading, Text } from "react-email";
import type { EmailTemplates } from "../templates";
import { EmailLayout } from "./layout";

export function OrgInvitation({
  inviterName,
  orgName,
  role,
  inviteUrl,
}: EmailTemplates["org_invitation"]) {
  return (
    <EmailLayout preview={`You have been invited to ${orgName}`}>
      <Heading as="h1">You have been invited</Heading>
      <Text>
        {inviterName} has invited you to join <strong>{orgName}</strong> as a {role}.
      </Text>
      <Button href={inviteUrl}>Accept invitation</Button>
      <Text>{inviteUrl}</Text>
    </EmailLayout>
  );
}
