import { createOTP } from "@better-auth/utils/otp";

/** Mirrors `apps/api/scripts/seed-staff.ts`: change both together. */
export const STAFF_MANAGER_EMAIL = "staff-manager@example.com";
const STAFF_TOTP_SECRET = "dev-seed-staff-totp-secret";

export function currentStaffCode(): Promise<string> {
  return createOTP(STAFF_TOTP_SECRET, { digits: 6, period: 30 }).totp();
}
