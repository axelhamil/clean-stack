import type { ConsentCategory } from "@packages/cookie-consent";

// The cookie register page reuses the consent panel's own category taxonomy
// (`common.cookieConsent.categories.*.label`) instead of a second, driftable
// copy — same categories, same source (recipe: "when to share a key"). Lives
// beside the feature, not inside `cookies.route.tsx`, per the route-file
// code-splitting rule.
export const CATEGORY_LABEL_KEYS = {
  necessary: "cookieConsent.categories.necessary.label",
  functional: "cookieConsent.categories.functional.label",
  analytics: "cookieConsent.categories.analytics.label",
  marketing: "cookieConsent.categories.marketing.label",
} as const satisfies Record<ConsentCategory, string>;
