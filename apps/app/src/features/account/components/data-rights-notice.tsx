import { TextLink } from "@packages/ui/components/ui/text-link";
import { TypographyMuted } from "@packages/ui/components/ui/typography";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Trans } from "react-i18next";

interface InlineLinkProps {
  children?: ReactNode;
}

function DataRightsLink({ children }: InlineLinkProps) {
  return (
    <TextLink asChild>
      <Link to="/legal/data-rights">{children}</Link>
    </TextLink>
  );
}

export function DataRightsNotice() {
  return (
    <TypographyMuted>
      <Trans
        ns="settings"
        i18nKey="account.dataRightsNotice"
        components={{
          dataRightsLink: <DataRightsLink />,
        }}
      />
    </TypographyMuted>
  );
}
