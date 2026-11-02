import { PageFallback } from "@packages/ui/components/ui/page-fallback";
import { TextLink } from "@packages/ui/components/ui/text-link";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

export function NotFoundPage() {
  const { t } = useTranslation();

  return (
    <PageFallback
      title={t("notFound.title")}
      description={t("notFound.description")}
      action={
        <TextLink asChild className="w-fit">
          <Link to="/">{t("notFound.backHome")}</Link>
        </TextLink>
      }
    />
  );
}
