import { createFileRoute } from "@tanstack/react-router";
import { PolicyDocView } from "./policy-doc-view";

export const Route = createFileRoute("/legal/terms")({
  component: TermsPage,
});

function TermsPage() {
  return <PolicyDocView type="terms" />;
}
