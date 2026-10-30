import { Button } from "@packages/ui/components/ui/button";
import { Moon, Sun } from "lucide-react";
import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { revealThemeChange } from "../theme/reveal-transition";
import { useTheme } from "../theme/use-theme";

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
    <Button
      ref={buttonRef}
      variant="ghost"
      size="icon"
      onClick={() => void revealThemeChange(buttonRef.current, () => setTheme(next))}
      aria-label={isDark ? t("theme.switchToLight") : t("theme.switchToDark")}
      className={className}
    >
      <Sun className="dark:hidden" />
      <Moon className="hidden dark:block" />
    </Button>
  );
}
