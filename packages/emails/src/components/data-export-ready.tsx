import { Button, Heading, Text } from "react-email";
import type { EmailTemplates } from "../templates";
import { EmailLayout } from "./layout";

type DataExportReadyVars = EmailTemplates["data_export_ready"];
interface DataExportReadyProps extends DataExportReadyVars {}
export function DataExportReady({ name, downloadUrl, expiresAt }: DataExportReadyProps) {
  return (
    <EmailLayout preview="Your data export is ready">
      <Heading as="h1">Your data export is ready</Heading>
      <Text>
        Hi {name}, your data export is ready to download. The link expires on {expiresAt}.
      </Text>
      <Button href={downloadUrl}>Download export</Button>
      <Text>{downloadUrl}</Text>
    </EmailLayout>
  );
}
