import { Heading, Text } from "react-email";
import type { EmailTemplates } from "../templates";
import { EmailLayout } from "./layout";

type NotificationDigestVars = EmailTemplates["notification_digest"];
interface NotificationDigestProps extends NotificationDigestVars {}

export function NotificationDigest({ category, itemCount, itemsSummary }: NotificationDigestProps) {
  return (
    <EmailLayout preview={`${itemCount} new ${category} notification(s)`}>
      <Heading as="h1">
        {itemCount} new {category} notification{itemCount === "1" ? "" : "s"}
      </Heading>
      <Text>Here is a summary of your recent {category} activity:</Text>
      <Text>{itemsSummary}</Text>
    </EmailLayout>
  );
}
