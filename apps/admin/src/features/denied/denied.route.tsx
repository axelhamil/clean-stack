import { Button } from "@packages/ui/components/ui/button";
import { pageContainerVariants } from "@packages/ui/components/ui/page-container";
import { PageHeader } from "@packages/ui/components/ui/page-header";
import { cn } from "@packages/ui/libs/utils.js";
import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { useSignOut } from "../../shared/auth/use-sign-out";
import { env } from "../../shared/env";

const deniedSearchSchema = z.object({
  reason: z.literal("mfa").optional().catch(undefined),
});

export const Route = createFileRoute("/denied")({
  validateSearch: deniedSearchSchema,
  component: DeniedPage,
});

function DeniedPage() {
  const { t } = useTranslation(["admin", "common"]);
  const { reason } = Route.useSearch();
  const signOut = useSignOut();
  const description =
    reason === "mfa" ? t("backOffice.denied.needsTwoFactor") : t("backOffice.denied.description");

  return (
    <main className={cn(pageContainerVariants({ width: "form" }), "flex flex-col gap-6 py-16")}>
      <PageHeader title={t("backOffice.denied.title")} description={description} />
      <div className="flex flex-wrap gap-2">
        <Button asChild>
          <a href={reason === "mfa" ? `${env.VITE_APP_URL}/settings/account` : env.VITE_APP_URL}>
            {t("backOffice.denied.backToApp")}
          </a>
        </Button>
        <Button variant="outline" disabled={signOut.isPending} onClick={() => signOut.mutate()}>
          {t("common:userMenu.signOut")}
        </Button>
      </div>
    </main>
  );
}
