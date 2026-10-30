import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
} from "@packages/ui/components/ui/card";
import { pageContainerVariants } from "@packages/ui/components/ui/page-container";
import { TextLink } from "@packages/ui/components/ui/text-link";
import { TypographyH1, TypographyMuted } from "@packages/ui/components/ui/typography";
import { cn } from "@packages/ui/libs/utils.js";
import type { ReactNode } from "react";
import { LegalFooter } from "../../../shared/components/legal-footer";
import { ThemeToggle } from "../../../shared/components/theme-toggle";

interface AuthShellProps {
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
}

export function AuthShell({ title, description, children, footer }: AuthShellProps) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex justify-end p-4">
        <ThemeToggle />
      </header>

      <main
        className={cn(
          pageContainerVariants({ width: "form" }),
          "flex flex-1 flex-col justify-center pb-8",
        )}
      >
        <Card>
          <CardHeader>
            <TypographyH1 variant="page">{title}</TypographyH1>

            {description && <CardDescription>{description}</CardDescription>}
          </CardHeader>

          <CardContent className="flex flex-col gap-6">{children}</CardContent>

          {footer && <CardFooter>{footer}</CardFooter>}
        </Card>
      </main>

      <LegalFooter />
    </div>
  );
}

interface AuthShellFooterProps {
  lead?: string;
  link: ReactNode;
}

export function AuthShellFooter({ lead, link }: AuthShellFooterProps) {
  return (
    <TypographyMuted>
      {lead ? `${lead} ` : null}
      <TextLink asChild>{link}</TextLink>
    </TypographyMuted>
  );
}
