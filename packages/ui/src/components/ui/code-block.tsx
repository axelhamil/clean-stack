import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";

import { cn } from "../../libs/utils";

const codeBlockVariants = cva("overflow-x-auto rounded bg-muted text-xs", {
  variants: {
    size: {
      sm: "p-2",
      md: "p-3",
    },
  },
  defaultVariants: {
    size: "md",
  },
});

function CodeBlock({
  className,
  size,
  ...props
}: React.ComponentProps<"pre"> & VariantProps<typeof codeBlockVariants>) {
  return (
    <pre data-slot="code-block" className={cn(codeBlockVariants({ size, className }))} {...props} />
  );
}

export { CodeBlock };
