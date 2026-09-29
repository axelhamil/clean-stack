import type * as React from "react";

import { cn } from "../../libs/utils";
import { pageContainerVariants } from "./page-container";

/**
 * A bar pinned to the bottom of the viewport above the page (a consent
 * prompt, a notice), its content laid out at page width: stacked on small
 * screens, message and actions side by side from `md` up. Landmark and label
 * props (`role`, `aria-label`) go on the bar itself.
 */
function BottomBanner({ className, children, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="bottom-banner"
      className={cn(
        "fixed right-0 bottom-0 left-0 z-50 border-t bg-background shadow-lg",
        className,
      )}
      {...props}
    >
      <div
        className={cn(
          pageContainerVariants(),
          "flex flex-col gap-4 py-4 md:flex-row md:items-center md:justify-between md:py-6",
        )}
      >
        {children}
      </div>
    </div>
  );
}

export { BottomBanner };
