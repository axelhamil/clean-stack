import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_protected/_shell/settings")({
  component: SettingsLayout,
});

function SettingsLayout() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-10">
      <Outlet />
    </div>
  );
}
