import { useTranslation } from "react-i18next";

export interface ErrorFallbackLabels {
  title: string;
  description: string;
  reloadLabel: string;
}

export function useErrorFallbackLabels(): ErrorFallbackLabels {
  const { t } = useTranslation("common");

  return {
    title: t("errorBoundary.title"),
    description: t("errorBoundary.body"),
    reloadLabel: t("actions.reload"),
  };
}
