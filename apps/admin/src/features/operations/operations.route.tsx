import { PageHeader } from "@packages/ui/components/ui/page-header";
import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { requireSection } from "../../shared/auth/require-section";
import { StaffPage } from "../../shared/components/staff-page";
import { DeadEventsSection } from "./components/dead-events-section";
import { JobsSection } from "./components/jobs-section";
import { StripeEventsSection } from "./components/stripe-events-section";

export const Route = createFileRoute("/_staff/operations")({
  beforeLoad: requireSection("operations"),
  component: OperationsPage,
});

function OperationsPage() {
  const { t } = useTranslation("admin");

  return (
    <StaffPage>
      <PageHeader title={t("operations.pageTitle")} />
      <DeadEventsSection />
      <JobsSection />
      <StripeEventsSection />
    </StaffPage>
  );
}
