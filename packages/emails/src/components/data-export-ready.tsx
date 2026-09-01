import { Button, Heading, Text } from "react-email";
import type { EmailProps } from "../templates";
import { EmailLayout } from "./layout";

export function DataExportReady({
  name,
  downloadUrl,
  expiresAt,
  t,
}: EmailProps<"data_export_ready">) {
  return (
    <EmailLayout preview={t("subjects.dataExportReady")} t={t}>
      <Heading as="h1">{t("dataExportReady.heading")}</Heading>
      <Text>{t("dataExportReady.body", { name, expiresAt })}</Text>
      <Button href={downloadUrl}>{t("dataExportReady.cta")}</Button>
      <Text>{downloadUrl}</Text>
    </EmailLayout>
  );
}
