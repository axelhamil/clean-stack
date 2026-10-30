import type * as React from "react";

import { cn } from "../../libs/utils";

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("animate-pulse rounded-md bg-accent", className)}
      {...props}
    />
  );
}

interface SkeletonGroupProps extends React.ComponentProps<"div"> {
  label: string;
}

function SkeletonGroup({ label, className, ...props }: SkeletonGroupProps) {
  return (
    <div
      data-slot="skeleton-group"
      role="status"
      aria-label={label}
      className={cn("flex flex-col", className)}
      {...props}
    />
  );
}

interface SkeletonTableProps {
  label: string;
  rows?: number;
  columns?: number;
}

function range(length: number): number[] {
  return Array.from({ length }, (_, position) => position);
}

function SkeletonTable({ label, rows = 5, columns = 4 }: SkeletonTableProps) {
  return (
    <SkeletonGroup label={label}>
      {range(rows + 1).map((row) => (
        <div key={row} className="flex h-10 items-center gap-4">
          {range(columns).map((column) => (
            <Skeleton key={column} className="h-4 flex-1" />
          ))}
        </div>
      ))}
    </SkeletonGroup>
  );
}

export { Skeleton, SkeletonGroup, SkeletonTable };
