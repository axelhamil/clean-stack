import { pageContainerVariants } from "@packages/ui/components/ui/page-container";
import { PageHeader } from "@packages/ui/components/ui/page-header";
import { TextLink } from "@packages/ui/components/ui/text-link";
import { cn } from "@packages/ui/libs/utils.js";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

export function NotFoundPage() {
  const { t } = useTranslation("admin");

  return (
    <main className={cn(pageContainerVariants(), "flex flex-col gap-6 py-8")}>
      <PageHeader
        title={t("backOffice.notFound.title")}
        description={t("backOffice.notFound.description")}
      />
      <TextLink asChild className="w-fit">
        <Link to="/">{t("backOffice.notFound.backHome")}</Link>
      </TextLink>
    </main>
  );
}
