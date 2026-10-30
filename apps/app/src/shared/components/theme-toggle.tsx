import { IconButton } from "@packages/ui/components/ui/icon-button";
import { revealThemeChange } from "@packages/web-kit/theme/reveal-transition";
import { useTheme } from "@packages/web-kit/theme/use-theme";
import { Moon, Sun } from "lucide-react";
import { useRef } from "react";
import { useTranslation } from "react-i18next";

interface ThemeToggleProps {
  className?: string;
}

export function ThemeToggle({ className }: ThemeToggleProps) {
  const { t } = useTranslation("common");
  const { resolvedTheme, setTheme } = useTheme();
  const buttonRef = useRef<HTMLButtonElement>(null);

  const isDark = resolvedTheme === "dark";
  const next = isDark ? "light" : "dark";

  return (
    <IconButton
      ref={buttonRef}
      variant="ghost"
      onClick={() => void revealThemeChange(buttonRef.current, () => setTheme(next))}
      label={isDark ? t("theme.switchToLight") : t("theme.switchToDark")}
      className={className}
    >
      <Sun className="dark:hidden" />
      <Moon className="hidden dark:block" />
    </IconButton>
  );
}
