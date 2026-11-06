import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import type * as React from "react";

import { cn } from "../../libs/utils";

const bandVariants = cva("", {
  variants: {
    edge: {
      top: "border-t",
      bottom: "border-b",
    },
    surface: {
      transparent: "",
      opaque: "bg-background",
    },
  },
  defaultVariants: {
    edge: "top",
    surface: "transparent",
  },
});

function Band({
  className,
  edge,
  surface,
  asChild = false,
  ...props
}: React.ComponentProps<"div"> &
  VariantProps<typeof bandVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot.Root : "div";
  return (
    <Comp data-slot="band" className={cn(bandVariants({ edge, surface, className }))} {...props} />
  );
}

export { Band };
