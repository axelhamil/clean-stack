import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/legal/privacy-policy")({
  component: lazyRouteComponent(() => import("./privacy-policy.page"), "PrivacyPolicyPage"),
});
