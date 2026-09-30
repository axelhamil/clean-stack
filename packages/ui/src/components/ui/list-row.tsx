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

/**
 * The row's content as one click target (mark a notification read, open an
 * item). It keeps the content's stacked text layout, which a `Button`, sized
 * for a single-line label, cannot hold without overriding its height and
 * padding.
 */
function ListRowButton({ className, type = "button", ...props }: React.ComponentProps<"button">) {
  return (
    <button
      data-slot="list-row-button"
      type={type}
      className={cn(
        "flex flex-col items-start gap-1 rounded-sm text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-default",
        className,
      )}
      {...props}
    />
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

export { ListRow, ListRowAction, ListRowButton, ListRowContent, ListRowMedia, ListRowMeta };
