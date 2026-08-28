import { createFileRoute, Outlet } from "@tanstack/react-router";
import { ensurePlatformAdmin } from "../shared/auth/ensure-platform-admin";

export const Route = createFileRoute("/_protected/_shell/_admin")({
  beforeLoad: ensurePlatformAdmin,
  component: () => <Outlet />,
});
