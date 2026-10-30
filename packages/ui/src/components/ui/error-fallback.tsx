import { cn } from "../../libs/utils";
import { Button } from "./button";
import { pageContainerVariants } from "./page-container";
import { PageHeader } from "./page-header";

export interface ErrorFallbackProps {
  title: string;
  description: string;
  reloadLabel: string;
}

function ErrorFallback({ title, description, reloadLabel }: ErrorFallbackProps) {
  return (
    <main className={cn(pageContainerVariants({ width: "form" }), "flex flex-col gap-6 py-16")}>
      <PageHeader title={title} description={description} />
      <Button variant="outline" className="w-fit" onClick={() => window.location.reload()}>
        {reloadLabel}
      </Button>
    </main>
  );
}

export { ErrorFallback };
