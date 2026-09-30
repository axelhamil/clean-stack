import type * as React from "react";

import { cn } from "../../libs/utils";
import { Textarea } from "./textarea";

/** A textarea for pasted machine text (XML metadata, certificates, JSON). */
function CodeTextarea({ className, ...props }: React.ComponentProps<typeof Textarea>) {
  return <Textarea className={cn("font-mono text-xs", className)} {...props} />;
}

export { CodeTextarea };
