import { Slot } from "radix-ui";
import type * as React from "react";

import { cn } from "../../libs/utils";

function TextLink({
  className,
  asChild = false,
  ...props
}: React.ComponentProps<"a"> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "a";
  return (
    <Comp
      data-slot="text-link"
      className={cn("underline underline-offset-4 hover:decoration-2", className)}
      {...props}
    />
  );
}

export { TextLink };
