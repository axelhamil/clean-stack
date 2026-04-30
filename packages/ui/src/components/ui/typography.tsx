import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";

import { cn } from "../../libs/utils";

const typographyH1Variants = cva("scroll-m-20 font-extrabold tracking-tight", {
  variants: {
    variant: {
      hero: "text-center text-4xl text-balance",
      page: "text-left text-3xl",
    },
  },
  defaultVariants: { variant: "hero" },
});

interface TypographyH1Props
  extends React.ComponentProps<"h1">,
    VariantProps<typeof typographyH1Variants> {}

function TypographyH1({ className, variant, ...props }: TypographyH1Props) {
  return (
    <h1
      data-slot="typography-h1"
      className={cn(typographyH1Variants({ variant }), className)}
      {...props}
    />
  );
}

function TypographyH2({ className, ...props }: React.ComponentProps<"h2">) {
  return (
    <h2
      data-slot="typography-h2"
      className={cn(
        "scroll-m-20 border-b pb-2 font-semibold text-3xl tracking-tight first:mt-0",
        className,
      )}
      {...props}
    />
  );
}

function TypographyH3({ className, ...props }: React.ComponentProps<"h3">) {
  return (
    <h3
      data-slot="typography-h3"
      className={cn("scroll-m-20 font-semibold text-2xl tracking-tight", className)}
      {...props}
    />
  );
}

function TypographyH4({ className, ...props }: React.ComponentProps<"h4">) {
  return (
    <h4
      data-slot="typography-h4"
      className={cn("scroll-m-20 font-semibold text-xl tracking-tight", className)}
      {...props}
    />
  );
}

function TypographyP({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="typography-p"
      className={cn("leading-7 [&:not(:first-child)]:mt-6", className)}
      {...props}
    />
  );
}

function TypographyLead({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="typography-lead"
      className={cn("text-muted-foreground text-xl", className)}
      {...props}
    />
  );
}

function TypographyLarge({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="typography-large"
      className={cn("font-semibold text-lg", className)}
      {...props}
    />
  );
}

function TypographySmall({ className, ...props }: React.ComponentProps<"small">) {
  return (
    <small
      data-slot="typography-small"
      className={cn("font-medium text-sm leading-none", className)}
      {...props}
    />
  );
}

function TypographyMuted({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="typography-muted"
      className={cn("text-muted-foreground text-sm", className)}
      {...props}
    />
  );
}

function TypographyBlockquote({ className, ...props }: React.ComponentProps<"blockquote">) {
  return (
    <blockquote
      data-slot="typography-blockquote"
      className={cn("mt-6 border-l-2 pl-6 italic", className)}
      {...props}
    />
  );
}

function TypographyInlineCode({ className, ...props }: React.ComponentProps<"code">) {
  return (
    <code
      data-slot="typography-inline-code"
      className={cn(
        "relative rounded bg-muted px-[0.3rem] py-[0.2rem] font-mono font-semibold text-sm",
        className,
      )}
      {...props}
    />
  );
}

function TypographyList({ className, ...props }: React.ComponentProps<"ul">) {
  return (
    <ul
      data-slot="typography-list"
      className={cn("my-6 ml-6 list-disc [&>li]:mt-2", className)}
      {...props}
    />
  );
}

export {
  TypographyBlockquote,
  TypographyH1,
  TypographyH2,
  TypographyH3,
  TypographyH4,
  TypographyInlineCode,
  TypographyLarge,
  TypographyLead,
  TypographyList,
  TypographyMuted,
  TypographyP,
  TypographySmall,
};
