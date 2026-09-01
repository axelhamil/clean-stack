import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import type * as React from "react";

import { cn } from "../../libs/utils";

const panelVariants = cva("rounded-md border", {
  variants: {
    tone: {
      default: "",
      muted: "bg-muted",
    },
    size: {
      sm: "p-3",
      md: "p-4",
    },
  },
  defaultVariants: {
    tone: "default",
    size: "sm",
  },
});

function Panel({
  className,
  tone,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"div"> &
  VariantProps<typeof panelVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot.Root : "div";
  return (
    <Comp data-slot="panel" className={cn(panelVariants({ tone, size, className }))} {...props} />
  );
}

export { Panel };
