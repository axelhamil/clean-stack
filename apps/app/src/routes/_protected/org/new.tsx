import { createFileRoute } from "@tanstack/react-router";
import { CreateOrgPage } from "../../../features/organization/new.page";

export const Route = createFileRoute("/_protected/org/new")({
  component: CreateOrgPage,
});
