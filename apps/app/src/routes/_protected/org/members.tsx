import { createFileRoute } from "@tanstack/react-router";
import { OrgMembersPage } from "../../../features/organization/members.page";

export const Route = createFileRoute("/_protected/org/members")({
  component: OrgMembersPage,
});
