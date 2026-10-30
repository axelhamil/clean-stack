import { Button } from "@packages/ui/components/ui/button";
import { TypographyH1, TypographyMuted } from "@packages/ui/components/ui/typography";
import { useTranslation } from "react-i18next";

export function AppErrorFallback() {
  const { t } = useTranslation();

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
      <TypographyH1>{t("errorBoundary.title")}</TypographyH1>
      <TypographyMuted>{t("errorBoundary.body")}</TypographyMuted>
      <Button variant="outline" onClick={() => window.location.reload()}>
        {t("actions.reload")}
      </Button>
    </main>
  );
}
