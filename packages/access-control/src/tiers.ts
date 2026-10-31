export const TIERS = ["free", "pro", "business"] as const;

export type Tier = (typeof TIERS)[number];

export const PAID_TIERS = ["pro", "business"] as const satisfies readonly Tier[];

export type PaidTier = (typeof PAID_TIERS)[number];

export const OVERRIDE_MAX_YEARS = 10;
