import { Slot } from "radix-ui";
import type * as React from "react";

import { cn } from "../../libs/utils";

function NavLink({
  className,
  asChild = false,
  ...props
}: React.ComponentProps<"a"> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "a";
  return (
    <Comp
      data-slot="nav-link"
      className={cn(
        "text-muted-foreground text-sm transition-colors hover:text-foreground",
        className,
      )}
      {...props}
    />
  );
}

export { NavLink };
