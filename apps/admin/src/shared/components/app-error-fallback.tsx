import { ErrorFallback } from "@packages/ui/components/ui/error-fallback";
import { useTranslation } from "react-i18next";

export function AppErrorFallback() {
  const { t } = useTranslation();

  return (
    <ErrorFallback
      title={t("errorBoundary.title")}
      description={t("errorBoundary.body")}
      reloadLabel={t("actions.reload")}
    />
  );
}
