import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import type * as React from "react";

import { cn } from "../../libs/utils";

const navLinkVariants = cva(
  "inline-flex shrink-0 items-center text-sm transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
  {
    variants: {
      variant: {
        plain: "text-muted-foreground hover:text-foreground",
        pill: "rounded-md px-3 py-1.5",
        underline: "relative h-10 px-3",
      },
      active: {
        true: "",
        false: "",
      },
    },
    compoundVariants: [
      {
        variant: "pill",
        active: true,
        className: "bg-accent text-accent-foreground",
      },
      {
        variant: "pill",
        active: false,
        className: "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
      },
      {
        variant: "underline",
        active: true,
        className:
          "text-foreground after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:bg-foreground",
      },
      {
        variant: "underline",
        active: false,
        className: "text-muted-foreground hover:text-foreground",
      },
    ],
    defaultVariants: {
      variant: "plain",
      active: false,
    },
  },
);

function NavLink({
  className,
  variant,
  active,
  asChild = false,
  ...props
}: React.ComponentProps<"a"> &
  VariantProps<typeof navLinkVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot.Root : "a";
  return (
    <Comp
      data-slot="nav-link"
      data-variant={variant}
      data-active={active ? "" : undefined}
      className={cn(navLinkVariants({ variant, active, className }))}
      {...props}
    />
  );
}

export { NavLink, navLinkVariants };
