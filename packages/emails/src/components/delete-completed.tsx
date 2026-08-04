import { Heading, Text } from "react-email";
import type { EmailTemplates } from "../templates";
import { EmailLayout } from "./layout";

type DeleteCompletedVars = EmailTemplates["delete_completed"];
interface DeleteCompletedProps extends DeleteCompletedVars {}
export function DeleteCompleted({ name }: DeleteCompletedProps) {
  return (
    <EmailLayout preview="Your account has been deleted">
      <Heading as="h1">Your account has been deleted</Heading>
      <Text>Hi {name}, your account and all associated data have been permanently deleted.</Text>
    </EmailLayout>
  );
}
