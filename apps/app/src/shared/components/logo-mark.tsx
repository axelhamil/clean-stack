import { cn } from "@packages/ui/libs/utils.js";

interface LogoMarkProps {
  className?: string;
}

export function LogoMark({ className }: LogoMarkProps) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="App logo"
      className={cn("size-6 text-foreground", className)}
    >
      <rect x="4" y="8" width="20" height="20" rx="5" fill="currentColor" fillOpacity="0.18" />
      <rect x="8" y="4" width="20" height="20" rx="5" fill="currentColor" />
      <path
        d="M14 10.5h8M14 14h5"
        stroke="var(--background)"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}
