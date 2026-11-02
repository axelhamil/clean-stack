import { PageFallback } from "@packages/ui/components/ui/page-fallback";
import { TextLink } from "@packages/ui/components/ui/text-link";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { sessionQueryOptions } from "../api/queries/session";
import { AppShell } from "./app-shell";

export function NotFoundPage() {
  const { t } = useTranslation();
  const { data: session } = useQuery(sessionQueryOptions);

  const page = (
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

  if (!session) return page;

  return <AppShell user={session.user}>{page}</AppShell>;
}
