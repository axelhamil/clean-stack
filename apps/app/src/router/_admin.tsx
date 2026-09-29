import { pageContainerVariants } from "@packages/ui/components/ui/page-container";
import { cn } from "@packages/ui/libs/utils.js";
import { createFileRoute, Outlet } from "@tanstack/react-router";
import { ensurePlatformAdmin } from "../shared/auth/ensure-platform-admin";

export const Route = createFileRoute("/_protected/_shell/_admin")({
  beforeLoad: ensurePlatformAdmin,
  component: () => (
    <div className={cn(pageContainerVariants(), "flex flex-col gap-6 py-10")}>
      <Outlet />
    </div>
  ),
});
