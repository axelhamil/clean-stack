import { Button } from "./button";
import { PageFallback } from "./page-fallback";

export interface ErrorFallbackProps {
  title: string;
  description: string;
  reloadLabel: string;
}

function ErrorFallback({ title, description, reloadLabel }: ErrorFallbackProps) {
  return (
    <PageFallback
      title={title}
      description={description}
      action={
        <Button variant="outline" className="w-fit" onClick={() => window.location.reload()}>
          {reloadLabel}
        </Button>
      }
    />
  );
}

export { ErrorFallback };
