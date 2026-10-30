import { pageContainerVariants } from "@packages/ui/components/ui/page-container";
import { cn } from "@packages/ui/libs/utils.js";
import type { ReactNode } from "react";

export interface StaffPageProps {
  children: ReactNode;
}

export function StaffPage({ children }: StaffPageProps) {
  return (
    <main className={cn(pageContainerVariants(), "flex flex-col gap-6 py-8")}>{children}</main>
  );
}
