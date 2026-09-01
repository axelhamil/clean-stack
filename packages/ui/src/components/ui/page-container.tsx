import { cva } from "class-variance-authority";

const pageContainerVariants = cva("mx-auto w-full px-4 sm:px-6", {
  variants: {
    width: {
      app: "max-w-5xl",
      wide: "max-w-7xl",
      prose: "max-w-3xl",
      form: "max-w-md",
    },
  },
  defaultVariants: {
    width: "app",
  },
});

export { pageContainerVariants };
