import { createFileRoute } from "@tanstack/react-router";
import { DataRightsPage } from "../features/legal/data-rights.page";

export const Route = createFileRoute("/legal/data-rights")({
  component: DataRightsPage,
});
