import type * as React from "react";

import { cn } from "../../libs/utils";

interface BackupCodeListProps extends Omit<React.ComponentProps<"ul">, "children"> {
  codes: readonly string[];
}

function BackupCodeList({ codes, className, ...props }: BackupCodeListProps) {
  return (
    <ul
      data-slot="backup-code-list"
      className={cn("grid grid-cols-2 gap-1 font-mono text-xs", className)}
      {...props}
    >
      {codes.map((code) => (
        <li key={code}>{code}</li>
      ))}
    </ul>
  );
}

export { BackupCodeList };
