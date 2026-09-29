import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "../../libs/utils";
import { Avatar, AvatarFallback } from "./avatar";

const initialsAvatarVariants = cva("", {
  variants: {
    size: {
      sm: "size-6 rounded-md",
      xs: "size-5 rounded",
    },
  },
  defaultVariants: { size: "sm" },
});

const initialsTextVariants = cva("", {
  variants: {
    size: {
      sm: "rounded-md text-[10px] font-medium",
      xs: "rounded text-[9px]",
    },
  },
  defaultVariants: { size: "sm" },
});

interface InitialsAvatarProps extends VariantProps<typeof initialsAvatarVariants> {
  initials: string;
  className?: string;
}

/**
 * A square mark carrying initials, for an entity with no picture (an
 * organization, a workspace), small enough to sit in a trigger or a list item.
 */
function InitialsAvatar({ initials, size, className }: InitialsAvatarProps) {
  return (
    <Avatar data-slot="initials-avatar" className={cn(initialsAvatarVariants({ size }), className)}>
      <AvatarFallback className={initialsTextVariants({ size })}>{initials}</AvatarFallback>
    </Avatar>
  );
}

export { InitialsAvatar };
