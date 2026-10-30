import { cn } from "@packages/ui/libs/utils.js";
import { useTranslation } from "react-i18next";

interface LogoMarkProps {
  className?: string;
}

export function LogoMark({ className }: LogoMarkProps) {
  const { t } = useTranslation("common");
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={t("shell.logoAlt")}
      className={cn("size-6", className)}
    >
      <rect x="4" y="8" width="20" height="20" rx="5" className="fill-input" />
      <rect x="8" y="4" width="20" height="20" rx="5" className="fill-foreground" />
      <path
        d="M14 10.5h8M14 14h5"
        className="stroke-background"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}
