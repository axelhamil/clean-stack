import { Slot } from "radix-ui";
import type * as React from "react";

import { cn } from "../../libs/utils";

interface BrandLinkProps extends React.ComponentProps<"a"> {
  asChild?: boolean;
}

function BrandLink({ className, asChild = false, ...props }: BrandLinkProps) {
  const Comp = asChild ? Slot.Root : "a";
  return (
    <Comp
      data-slot="brand-link"
      className={cn(
        "inline-flex items-center gap-2 text-sm font-semibold tracking-tight outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
        className,
      )}
      {...props}
    />
  );
}

export { BrandLink };
