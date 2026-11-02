import type { ReactNode } from "react";

import { TypographyH1, TypographyMuted } from "./typography";

export interface PageHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}

function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <header data-slot="page-header" className="flex flex-wrap items-start justify-between gap-4">
      <div className="flex min-w-0 flex-col gap-2">
        <TypographyH1 variant="page" className="break-words">
          {title}
        </TypographyH1>
        {typeof description === "string" ? (
          <TypographyMuted>{description}</TypographyMuted>
        ) : (
          description
        )}
      </div>
      {actions}
    </header>
  );
}

export { PageHeader };
