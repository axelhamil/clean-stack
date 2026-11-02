import { type ReactNode, useId } from "react";

import { Separator } from "./separator";
import { TypographyH2, TypographyMuted } from "./typography";

export interface SettingsSectionProps {
  title: string;
  description?: ReactNode;
  tone?: "default" | "destructive";
  children: ReactNode;
}

function SettingsSection({ title, description, tone = "default", children }: SettingsSectionProps) {
  const titleId = useId();

  return (
    <section
      data-slot="settings-section"
      aria-labelledby={titleId}
      className="group/settings-section flex flex-col gap-8"
    >
      <Separator className="group-first-of-type/settings-section:hidden" />
      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-3 lg:gap-8">
        <div className="flex flex-col gap-1">
          <TypographyH2 id={titleId} variant="section" tone={tone}>
            {title}
          </TypographyH2>
          {description ? <TypographyMuted>{description}</TypographyMuted> : null}
        </div>
        <div className="flex min-w-0 flex-col gap-4 lg:col-span-2">{children}</div>
      </div>
    </section>
  );
}

export { SettingsSection };
