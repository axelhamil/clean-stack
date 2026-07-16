import type * as React from "react";

import { cn } from "../../libs/utils";

interface BackupCodeListProps extends Omit<React.ComponentProps<"ul">, "children"> {
  codes: readonly string[];
}

function formatBackupCode(code: string): string {
  if (code.length < 8) return code;
  const mid = Math.ceil(code.length / 2);
  return `${code.slice(0, mid)}-${code.slice(mid)}`;
}

function BackupCodeList({ codes, className, ...props }: BackupCodeListProps) {
  return (
    <ul
      data-slot="backup-code-list"
      className={cn("grid grid-cols-2 gap-1 font-mono text-xs", className)}
      {...props}
    >
      {codes.map((code) => (
        <li key={code}>{formatBackupCode(code)}</li>
      ))}
    </ul>
  );
}

export { BackupCodeList, formatBackupCode };
