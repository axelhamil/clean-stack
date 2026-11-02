import type { ReactNode } from "react";
import { cn } from "../../libs/utils";
import { pageContainerVariants } from "./page-container";
import { PageHeader } from "./page-header";

export interface PageFallbackProps {
  title: string;
  description: string;
  action: ReactNode;
}

function PageFallback({ title, description, action }: PageFallbackProps) {
  return (
    <main className={cn(pageContainerVariants({ width: "form" }), "flex flex-col gap-6 py-16")}>
      <PageHeader title={title} description={description} />
      {action}
    </main>
  );
}

export { PageFallback };
