import type { TFunction } from "i18next";
import { Heading, Text } from "react-email";
import type { EmailProps, EmailTemplates } from "../templates";
import { EmailLayout } from "./layout";

type DigestVariables = EmailTemplates["notification_digest"];

/**
 * The digest's subject is also its heading and preview, so the plural count
 * and category interpolation live here once instead of being rebuilt by the
 * component and by the renderer's subject line.
 */
export function notificationDigestSubject(
  t: TFunction<"emails">,
  { itemCount, category }: Pick<DigestVariables, "itemCount" | "category">,
): string {
  return t("subjects.notificationDigest", { count: Number(itemCount), category });
}

export function NotificationDigest({
  category,
  itemCount,
  itemsSummary,
  t,
}: EmailProps<"notification_digest">) {
  const subject = notificationDigestSubject(t, { itemCount, category });

  return (
    <EmailLayout preview={subject} t={t}>
      <Heading as="h1">{subject}</Heading>
      <Text>{t("notificationDigest.intro", { category })}</Text>
      <Text>{itemsSummary}</Text>
    </EmailLayout>
  );
}
