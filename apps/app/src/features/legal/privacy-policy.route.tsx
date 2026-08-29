import { createFileRoute } from "@tanstack/react-router";
import { PolicyDocView } from "./policy-doc-view";

export const Route = createFileRoute("/legal/privacy-policy")({
  component: PrivacyPolicyPage,
});

function PrivacyPolicyPage() {
  return <PolicyDocView type="privacy" />;
}
