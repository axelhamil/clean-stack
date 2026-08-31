import { Badge } from "@packages/ui/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@packages/ui/components/ui/card";
import { TypographyMuted } from "@packages/ui/components/ui/typography";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { policiesQueryOptions } from "../../../shared/api/queries/policies";
import { policyLabelFor } from "../../../shared/legal/policy-labels";

export function PolicyAcceptanceCard() {
  const { data, isLoading } = useQuery(policiesQueryOptions);
  const { t } = useTranslation("settings");
  const { t: tCommon } = useTranslation("common");

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("privacy.policyAcceptance.title")}</CardTitle>
        <CardDescription>{t("privacy.policyAcceptance.description")}</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <TypographyMuted>{t("privacy.policyAcceptance.loading")}</TypographyMuted>
        ) : data ? (
          <ul className="flex flex-col divide-y">
            {Object.entries(data).map(([type, status]) => (
              <li key={type} className="flex items-center justify-between gap-4 py-3">
                <span className="text-sm font-medium">{policyLabelFor(type, tCommon)}</span>
                <div className="flex items-center gap-3">
                  <TypographyMuted className="text-xs">
                    {status.acceptedVersion
                      ? `v${status.acceptedVersion}`
                      : t("privacy.policyAcceptance.neverAccepted")}
                  </TypographyMuted>
                  {status.current ? (
                    <Badge variant="secondary">{t("privacy.policyAcceptance.upToDate")}</Badge>
                  ) : (
                    <Badge variant="destructive">
                      {t("privacy.policyAcceptance.updateRequired")}
                    </Badge>
                  )}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <TypographyMuted>{t("privacy.policyAcceptance.loadError")}</TypographyMuted>
        )}
      </CardContent>
    </Card>
  );
}
