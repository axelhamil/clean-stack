import { NavLink } from "@packages/ui/components/ui/nav-link";
import { ArrowLeft } from "lucide-react";
import type { ReactElement, ReactNode } from "react";

export interface BackLinkProps {
  link: ReactElement;
  children?: ReactNode;
}

export function BackLink({ link }: BackLinkProps) {
  return (
    <NavLink asChild variant="plain" className="gap-1 self-start">
      {link}
    </NavLink>
  );
}

export function BackIcon() {
  return <ArrowLeft className="size-4" aria-hidden />;
}
