import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@packages/ui/components/ui/card";
import { TextLink } from "@packages/ui/components/ui/text-link";
import { TypographyMuted } from "@packages/ui/components/ui/typography";
import { cn } from "@packages/ui/libs/utils.js";
import type { ReactNode } from "react";
import { ThemeToggle } from "../../../shared/components/theme-toggle";

interface AuthShellProps {
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}

export function AuthShell({ title, description, children, footer, className }: AuthShellProps) {
  return (
    <div className="relative flex min-h-dvh items-center justify-center">
      <ThemeToggle className="absolute top-4 right-4" />

      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{title}</CardTitle>

          {description && <CardDescription>{description}</CardDescription>}
        </CardHeader>

        <CardContent className={cn(className)}>{children}</CardContent>

        {footer && <CardFooter>{footer}</CardFooter>}
      </Card>
    </div>
  );
}

interface AuthShellFooterProps {
  lead?: string;
  link: ReactNode;
}

export function AuthShellFooter({ lead, link }: AuthShellFooterProps) {
  return (
    <TypographyMuted className="w-full text-center">
      {lead ? `${lead} ` : null}
      <TextLink asChild>{link}</TextLink>
    </TypographyMuted>
  );
}
