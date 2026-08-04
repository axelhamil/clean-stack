import { Heading, Text } from "@react-email/components";
import type { EmailTemplates } from "../templates";
import { EmailLayout } from "./layout";

export function DeleteCompleted({ name }: EmailTemplates["delete_completed"]) {
  return (
    <EmailLayout preview="Your account has been deleted">
      <Heading as="h1">Your account has been deleted</Heading>
      <Text>Hi {name}, your account and all associated data have been permanently deleted.</Text>
    </EmailLayout>
  );
}
