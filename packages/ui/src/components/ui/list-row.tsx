import type * as React from "react";

import { cn } from "../../libs/utils";

function ListRow({ className, ...props }: React.ComponentProps<"li">) {
  return (
    <li
      data-slot="list-row"
      className={cn("flex items-center justify-between gap-3 rounded-md border p-3", className)}
      {...props}
    />
  );
}

function ListRowMedia({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="list-row-media"
      className={cn(
        "flex items-center gap-3 [&>svg:first-child]:size-5 [&>svg:first-child]:text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

function ListRowContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div data-slot="list-row-content" className={cn("flex flex-col gap-1", className)} {...props} />
  );
}

function ListRowMeta({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="list-row-meta"
      className={cn("flex items-center gap-2", className)}
      {...props}
    />
  );
}

function ListRowAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="list-row-action"
      className={cn("flex items-center gap-2", className)}
      {...props}
    />
  );
}

export { ListRow, ListRowAction, ListRowContent, ListRowMedia, ListRowMeta };
