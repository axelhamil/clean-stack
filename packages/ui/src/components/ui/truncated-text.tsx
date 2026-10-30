import { cva, type VariantProps } from "class-variance-authority";
import { useCallback, useEffect, useState } from "react";

import { cn } from "../../libs/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip";

const truncatedTextVariants = cva(
  "block max-w-full rounded-xs break-all whitespace-normal outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 sm:pointer-fine:truncate",
  {
    variants: {
      font: {
        sans: "",
        mono: "font-mono",
      },
    },
    defaultVariants: { font: "sans" },
  },
);

function useTruncationTooltip<T extends HTMLElement>(value: string) {
  const [element, setElement] = useState<T | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [open, setOpen] = useState(false);

  const measure = useCallback(() => {
    if (!element) return;

    const clipped = element.scrollWidth > element.clientWidth;
    setTruncated(clipped);
    if (!clipped) setOpen(false);
  }, [element]);

  useEffect(measure, [measure, value]);

  useEffect(() => {
    if (!element) return;

    const observer = new ResizeObserver(measure);
    observer.observe(element);

    return () => observer.disconnect();
  }, [element, measure]);

  const onOpenChange = (next: boolean) => {
    measure();
    setOpen(next);
  };

  return { ref: setElement, truncated, tooltipProps: { open: open && truncated, onOpenChange } };
}

interface TruncatedTextProps extends VariantProps<typeof truncatedTextVariants> {
  value: string;
  className?: string;
}

function TruncatedText({ value, font, className }: TruncatedTextProps) {
  const { ref, truncated, tooltipProps } = useTruncationTooltip<HTMLSpanElement>(value);

  return (
    <Tooltip {...tooltipProps}>
      <TooltipTrigger asChild>
        <span
          ref={ref}
          data-slot="truncated-text"
          tabIndex={truncated ? 0 : undefined}
          className={cn(truncatedTextVariants({ font }), className)}
        >
          {value}
        </span>
      </TooltipTrigger>
      <TooltipContent>{value}</TooltipContent>
    </Tooltip>
  );
}

export { TruncatedText, useTruncationTooltip };
