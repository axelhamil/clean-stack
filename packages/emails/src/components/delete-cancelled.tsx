import { Heading, Text } from "react-email";
import type { EmailTemplates } from "../templates";
import { EmailLayout } from "./layout";

export function DeleteCancelled({ name }: EmailTemplates["delete_cancelled"]) {
  return (
    <EmailLayout preview="Account deletion cancelled">
      <Heading as="h1">Account deletion cancelled</Heading>
      <Text>
        Hi {name}, your account deletion request has been cancelled. Your account remains active.
      </Text>
    </EmailLayout>
  );
}
