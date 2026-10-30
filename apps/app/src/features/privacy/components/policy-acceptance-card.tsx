import { Badge } from "@packages/ui/components/ui/badge";
import { ListRow, ListRowAction } from "@packages/ui/components/ui/list-row";
import { SettingsSection } from "@packages/ui/components/ui/settings-section";
import { TypographyMuted, TypographySmall } from "@packages/ui/components/ui/typography";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { policiesQueryOptions } from "../../../shared/api/queries/policies";
import { policyLabelFor } from "../../../shared/legal/policy-labels";

export function PolicyAcceptanceCard() {
  const { data, isLoading } = useQuery(policiesQueryOptions);
  const { t } = useTranslation("settings");
  const { t: tCommon } = useTranslation("common");

  return (
    <SettingsSection
      title={t("privacy.policyAcceptance.title")}
      description={t("privacy.policyAcceptance.description")}
    >
      {isLoading ? (
        <TypographyMuted>{t("privacy.policyAcceptance.loading")}</TypographyMuted>
      ) : data ? (
        <ul className="flex flex-col gap-2">
          {Object.entries(data).map(([type, status]) => (
            <ListRow variant="plain" key={type} className="flex-wrap">
              <TypographySmall>{policyLabelFor(type, tCommon)}</TypographySmall>
              <ListRowAction className="flex-wrap">
                <TypographyMuted>
                  {status.acceptedVersion
                    ? t("privacy.policyAcceptance.acceptedVersion", {
                        version: status.acceptedVersion,
                      })
                    : t("privacy.policyAcceptance.neverAccepted")}
                </TypographyMuted>
                {status.current ? (
                  <Badge variant="secondary">{t("privacy.policyAcceptance.upToDate")}</Badge>
                ) : (
                  <Badge variant="destructive">
                    {t("privacy.policyAcceptance.updateRequired")}
                  </Badge>
                )}
              </ListRowAction>
            </ListRow>
          ))}
        </ul>
      ) : (
        <TypographyMuted>{t("privacy.policyAcceptance.loadError")}</TypographyMuted>
      )}
    </SettingsSection>
  );
}
