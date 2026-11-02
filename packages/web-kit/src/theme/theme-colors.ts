import type { ResolvedTheme } from "./theme-store";

export const THEME_COLORS = {
  light: "#fbfcfd",
  dark: "#0d1013",
} as const satisfies Record<ResolvedTheme, string>;
