import { pageContainerVariants } from "@packages/ui/components/ui/page-container";
import { PageHeader } from "@packages/ui/components/ui/page-header";
import { cn } from "@packages/ui/libs/utils.js";
import { createFileRoute, notFound } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { sectionOpenTo } from "../../shared/nav/sections";

export const Route = createFileRoute("/_staff/$section")({
  beforeLoad: ({ context, params }) => {
    const section = sectionOpenTo(params.section, context.me.permissions);
    if (!section) throw notFound();

    return { section };
  },
  component: SectionPage,
});

function SectionPage() {
  const { t } = useTranslation("admin");
  const { section } = Route.useRouteContext();

  return (
    <main className={cn(pageContainerVariants(), "py-8")}>
      <PageHeader
        title={t(`backOffice.sections.${section.id}`)}
        description={t("backOffice.sectionNotBuilt")}
      />
    </main>
  );
}
