import type { ConsentCategory } from "@packages/cookie-consent";

export interface CookieInfo {
  name: string;
  provider: string;
  purpose: string;
  retention: string;
}

export const COOKIE_INVENTORY: Record<ConsentCategory, readonly CookieInfo[]> = {
  necessary: [
    {
      name: "cc_sid",
      provider: "This application",
      purpose:
        "Consent subject identifier — associates your cookie choices with this device. Set server-side (httpOnly) on first consent interaction.",
      retention: "180 days",
    },
    {
      name: "better-auth.session_token",
      provider: "This application (BetterAuth)",
      purpose: "Authenticates the signed-in user session.",
      retention: "7 days (standard) / 30 days (remember me)",
    },
  ],
  functional: [
    {
      name: "(none active by default)",
      provider: "—",
      purpose:
        "No functional cookies are set in this boilerplate. Add entries here when you integrate a tool requiring them (e.g. a live-chat widget, video player preferences).",
      retention: "—",
    },
  ],
  analytics: [
    {
      name: "(none active by default)",
      provider: "—",
      purpose:
        "No analytics cookies are set in this boilerplate. Add entries here when you integrate an analytics tool (e.g. Umami, PostHog).",
      retention: "—",
    },
  ],
  marketing: [
    {
      name: "(none active by default)",
      provider: "—",
      purpose:
        "No marketing cookies are set in this boilerplate. Add entries here when you integrate a retargeting or advertising tool.",
      retention: "—",
    },
  ],
};
