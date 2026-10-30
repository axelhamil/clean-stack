import { createFileRoute, Outlet } from "@tanstack/react-router";
import { meQueryOptions } from "../shared/api/queries/me";
import { refusalRedirect } from "../shared/auth/refusal-redirect";
import { StepUpGate } from "../shared/auth/step-up-gate";
import { AdminShell } from "../shared/components/admin-shell";
import { useStaffLiveUpdates } from "../shared/hooks/use-staff-live-updates";

export const Route = createFileRoute("/_staff")({
  beforeLoad: async ({ context, location }) => {
    const me = await context.queryClient.fetchQuery(meQueryOptions).catch((error: unknown) => {
      const refusal = refusalRedirect(error, `${window.location.origin}${location.href}`);
      if (refusal) throw refusal;

      const known = context.queryClient.getQueryData(meQueryOptions.queryKey);
      if (known) return known;

      throw error;
    });

    return { me };
  },
  component: StaffLayout,
});

function StaffLayout() {
  useStaffLiveUpdates();

  return (
    <AdminShell>
      <Outlet />
      <StepUpGate />
    </AdminShell>
  );
}
