import { pageContainerVariants } from "@packages/ui/components/ui/page-container";
import { cn } from "@packages/ui/libs/utils.js";
import { createFileRoute, Outlet } from "@tanstack/react-router";
import { ensureStaffAccess } from "../shared/auth/ensure-staff";

export const Route = createFileRoute("/_protected/_shell/_admin")({
  beforeLoad: ensureStaffAccess,
  component: () => (
    <div className={cn(pageContainerVariants(), "py-8")}>
      <Outlet />
    </div>
  ),
});
