import type * as React from "react";

import { cn } from "../../libs/utils";

// White background is fixed (not theme-bound) so QR scanners stay legible
// even in dark mode — high-contrast modules require a known light surface.
function QrCodeFrame({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="qr-code-frame"
      className={cn("rounded-lg bg-white p-3", className)}
      {...props}
    />
  );
}

export { QrCodeFrame };
