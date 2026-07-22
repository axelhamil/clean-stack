import { createRoute, lazyRouteComponent } from "@tanstack/react-router";
import { settingsLayout } from "../../router/layouts";

export const privacyRoute = createRoute({
  getParentRoute: () => settingsLayout,
  path: "privacy",
  component: lazyRouteComponent(() => import("./privacy.page"), "PrivacyPage"),
});
