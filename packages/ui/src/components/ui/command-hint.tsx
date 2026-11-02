import type * as React from "react";

import { cn } from "../../libs/utils";

/**
 * A short status next to a command item's label ("active", "current"), styled
 * like `CommandShortcut` but without its right alignment, so both can sit in
 * one item.
 */
function CommandHint({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="command-hint"
      className={cn("text-xs text-muted-foreground", className)}
      {...props}
    />
  );
}

export { CommandHint };
