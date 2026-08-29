import type { TFunction } from "i18next";
import { Button, Heading, Text } from "react-email";
import type { EmailTemplates } from "../templates";
import { EmailLayout } from "./layout";

type DataExportReadyVars = EmailTemplates["data_export_ready"];
interface DataExportReadyProps extends DataExportReadyVars {
  t: TFunction<"emails">;
}

export function DataExportReady({ name, downloadUrl, expiresAt, t }: DataExportReadyProps) {
  return (
    <EmailLayout preview={t("subjects.dataExportReady")} t={t}>
      <Heading as="h1">{t("dataExportReady.heading")}</Heading>
      <Text>{t("dataExportReady.body", { name, expiresAt })}</Text>
      <Button href={downloadUrl}>{t("dataExportReady.cta")}</Button>
      <Text>{downloadUrl}</Text>
    </EmailLayout>
  );
}
