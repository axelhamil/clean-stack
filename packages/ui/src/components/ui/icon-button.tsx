import type * as React from "react";

import { Button } from "./button";
import { KeyboardShortcut } from "./keyboard-shortcut";
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip";

interface IconButtonProps
  extends Omit<React.ComponentProps<typeof Button>, "size" | "asChild" | "aria-label"> {
  label: string;
  accessibleName?: string;
  shortcut?: string;
  size?: "icon" | "icon-xs" | "icon-sm" | "icon-lg";
}

function IconButton({ label, accessibleName, shortcut, size = "icon", ...props }: IconButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button size={size} aria-label={accessibleName ?? label} {...props} />
      </TooltipTrigger>
      <TooltipContent className="flex items-center gap-2">
        {label}
        {shortcut && <KeyboardShortcut>{shortcut}</KeyboardShortcut>}
      </TooltipContent>
    </Tooltip>
  );
}

export { IconButton };
