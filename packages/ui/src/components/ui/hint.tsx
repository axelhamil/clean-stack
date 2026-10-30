import type * as React from "react";
import { useId, useState } from "react";

import { cn } from "../../libs/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip";

interface HintProps {
  text: string | undefined;
  showOnTouch?: boolean;
  className?: string;
  children: React.ReactNode;
}

function Hint({ text, showOnTouch = true, className, children }: HintProps) {
  const textId = useId();
  const [open, setOpen] = useState(false);

  return (
    <span
      data-slot="hint"
      role={text ? "group" : undefined}
      aria-describedby={text ? textId : undefined}
      className={cn("inline-flex max-w-full flex-col gap-1", className)}
    >
      <Tooltip open={open && Boolean(text)} onOpenChange={setOpen}>
        <TooltipTrigger asChild>
          <span
            tabIndex={text ? 0 : undefined}
            className="inline-flex w-full flex-col rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            {children}
          </span>
        </TooltipTrigger>
        {text && <TooltipContent>{text}</TooltipContent>}
      </Tooltip>
      {text && (
        <span
          id={textId}
          className={cn(
            "hidden text-xs text-muted-foreground",
            showOnTouch && "pointer-coarse:block",
          )}
        >
          {text}
        </span>
      )}
    </span>
  );
}

export { Hint };
