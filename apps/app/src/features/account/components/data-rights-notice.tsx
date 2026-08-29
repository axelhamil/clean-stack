import { navLinkVariants } from "@packages/ui/components/ui/nav-link";
import { TypographyMuted } from "@packages/ui/components/ui/typography";
import { Link } from "@tanstack/react-router";
import { Trans } from "react-i18next";

export function DataRightsNotice() {
  return (
    <TypographyMuted>
      <Trans
        ns="settings"
        i18nKey="account.dataRightsNotice"
        components={{
          dataRightsLink: (
            <Link to="/legal/data-rights" className={navLinkVariants({ variant: "underline" })} />
          ),
        }}
      />
    </TypographyMuted>
  );
}
