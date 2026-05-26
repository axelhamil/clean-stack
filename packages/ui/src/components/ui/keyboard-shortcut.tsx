import type * as React from "react";

import { cn } from "../../libs/utils";

function KeyboardShortcut({ className, ...props }: React.ComponentProps<"kbd">) {
  return (
    <kbd
      data-slot="keyboard-shortcut"
      className={cn(
        "rounded border bg-muted px-1.5 py-0.5 font-medium text-muted-foreground text-xs",
        className,
      )}
      {...props}
    />
  );
}

export { KeyboardShortcut };
