import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";

import { cn } from "../../libs/utils";

const descriptionListVariants = cva("group/description-list flex flex-col", {
  variants: {
    layout: {
      // Term above its value, small text: metadata in a sheet or a panel.
      stacked: "gap-2",
      // Term and value on one row, pushed apart: a record's fields in a card.
      inline: "gap-3",
    },
  },
  defaultVariants: { layout: "stacked" },
});

interface DescriptionListProps
  extends React.ComponentProps<"dl">,
    VariantProps<typeof descriptionListVariants> {}

/**
 * Label and value pairs (`dl` / `dt` / `dd`), so a screen reader announces
 * each value with its label. The list's `layout` styles every item in it.
 */
function DescriptionList({ className, layout = "stacked", ...props }: DescriptionListProps) {
  return (
    <dl
      data-slot="description-list"
      data-layout={layout}
      className={cn(descriptionListVariants({ layout }), className)}
      {...props}
    />
  );
}

function DescriptionItem({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="description-item"
      className={cn(
        "group-data-[layout=inline]/description-list:flex group-data-[layout=inline]/description-list:items-center group-data-[layout=inline]/description-list:justify-between",
        className,
      )}
      {...props}
    />
  );
}

function DescriptionTerm({ className, ...props }: React.ComponentProps<"dt">) {
  return (
    <dt
      data-slot="description-term"
      className={cn(
        "group-data-[layout=stacked]/description-list:text-sm group-data-[layout=stacked]/description-list:font-medium",
        className,
      )}
      {...props}
    />
  );
}

function DescriptionDetails({ className, ...props }: React.ComponentProps<"dd">) {
  return (
    <dd
      data-slot="description-details"
      className={cn(
        "group-data-[layout=stacked]/description-list:text-sm group-data-[layout=inline]/description-list:flex group-data-[layout=inline]/description-list:items-center group-data-[layout=inline]/description-list:gap-2",
        className,
      )}
      {...props}
    />
  );
}

export { DescriptionDetails, DescriptionItem, DescriptionList, DescriptionTerm };
