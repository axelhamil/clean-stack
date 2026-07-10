export const CONSENT_CATEGORIES = ["necessary", "functional", "analytics", "marketing"] as const;
export const OPTIONAL_CATEGORIES = ["functional", "analytics", "marketing"] as const;
export type ConsentCategory = (typeof CONSENT_CATEGORIES)[number];
