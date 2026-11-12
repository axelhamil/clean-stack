import type { TOTPOptions } from "better-auth/plugins/two-factor";

export const TOTP_OPTIONS = { digits: 6, period: 30 } as const satisfies TOTPOptions;
