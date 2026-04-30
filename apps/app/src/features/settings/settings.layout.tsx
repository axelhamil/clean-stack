import { Outlet } from "@tanstack/react-router";

export function SettingsLayout() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-10">
      <Outlet />
    </div>
  );
}
