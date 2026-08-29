import type { TFunction } from "i18next";
import { Heading, Text } from "react-email";
import type { EmailTemplates } from "../templates";
import { EmailLayout } from "./layout";

type NotificationDigestVars = EmailTemplates["notification_digest"];
interface NotificationDigestProps extends NotificationDigestVars {
  t: TFunction<"emails">;
}

export function NotificationDigest({
  category,
  itemCount,
  itemsSummary,
  t,
}: NotificationDigestProps) {
  const subject = t("subjects.notificationDigest", { count: Number(itemCount), category });
  return (
    <EmailLayout preview={subject} t={t}>
      <Heading as="h1">{subject}</Heading>
      <Text>{t("notificationDigest.intro", { category })}</Text>
      <Text>{itemsSummary}</Text>
    </EmailLayout>
  );
}
