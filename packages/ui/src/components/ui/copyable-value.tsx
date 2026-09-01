import { CopyIcon } from "lucide-react";
import type * as React from "react";

import { cn } from "../../libs/utils";
import { Button } from "./button";
import { Panel } from "./panel";

interface CopyableValueProps extends Omit<React.ComponentProps<"div">, "onCopy"> {
  value: string;
  copyLabel: string;
  onCopied?: () => void;
}

function CopyableValue({ value, copyLabel, onCopied, className, ...props }: CopyableValueProps) {
  const copy = () => {
    void navigator.clipboard.writeText(value);
    onCopied?.();
  };

  return (
    <Panel
      tone="muted"
      className={cn("flex items-center gap-2 font-mono text-sm break-all", className)}
      {...props}
    >
      <span className="flex-1">{value}</span>
      <Button size="icon" variant="ghost" onClick={copy} aria-label={copyLabel}>
        <CopyIcon className="size-4" />
      </Button>
    </Panel>
  );
}

export { CopyableValue };
