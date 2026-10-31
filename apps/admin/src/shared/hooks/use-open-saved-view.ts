import type { StaffView } from "@packages/access-control";
import { useNavigate } from "@tanstack/react-router";

export function useOpenSavedView(): (view: StaffView) => Promise<void> {
  const navigate = useNavigate();

  return (view) => {
    switch (view.screen) {
      case "users":
        return navigate({ to: "/users", search: view.filters });
      case "orgs":
        return navigate({ to: "/orgs", search: view.filters });
      case "audit":
        return navigate({ to: "/audit", search: view.filters });
    }
  };
}
