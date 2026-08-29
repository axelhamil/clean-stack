import { Heading, Text } from "react-email";
import type { EmailProps } from "../templates";
import { EmailLayout } from "./layout";

export function NotificationDigest({
  category,
  itemCount,
  itemsSummary,
  t,
}: EmailProps<"notification_digest">) {
  const subject = t("subjects.notificationDigest", { count: Number(itemCount), category });
  return (
    <EmailLayout preview={subject} t={t}>
      <Heading as="h1">{subject}</Heading>
      <Text>{t("notificationDigest.intro", { category })}</Text>
      <Text>{itemsSummary}</Text>
    </EmailLayout>
  );
}
