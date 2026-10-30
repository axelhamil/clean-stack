import { ListRow, ListRowContent } from "@packages/ui/components/ui/list-row";
import { NavLink } from "@packages/ui/components/ui/nav-link";
import { SettingsSection } from "@packages/ui/components/ui/settings-section";
import { TypographyMuted, TypographySmall } from "@packages/ui/components/ui/typography";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { SUB_PROCESSOR_KEYS } from "../../../shared/sub-processor-labels";
import { SUB_PROCESSORS } from "../../../shared/sub-processors.config";

const activeProcessors = SUB_PROCESSORS.filter((sp) => sp.status === "active");

export function DataSourcesCard() {
  const { t } = useTranslation("settings");
  const { t: tCommon } = useTranslation("common");

  return (
    <SettingsSection
      title={t("privacy.dataSources.title")}
      description={t("privacy.dataSources.description")}
    >
      <ul className="flex flex-col gap-2">
        {activeProcessors.map((sp) => (
          <ListRow variant="plain" key={sp.id}>
            <ListRowContent>
              <TypographySmall>{sp.name}</TypographySmall>
              <TypographyMuted>
                {tCommon(SUB_PROCESSOR_KEYS[sp.id].purpose)} ·{" "}
                {tCommon(SUB_PROCESSOR_KEYS[sp.id].region)}
              </TypographyMuted>
            </ListRowContent>
          </ListRow>
        ))}
      </ul>
      <NavLink asChild variant="underline" className="self-start">
        <Link to="/legal/sub-processors">{t("privacy.dataSources.viewAll")}</Link>
      </NavLink>
    </SettingsSection>
  );
}
