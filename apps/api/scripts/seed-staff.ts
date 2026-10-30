import { authSchema, db, eq, staffSchema } from "@packages/drizzle";
import { hashPassword } from "better-auth/crypto";
import { di } from "../src/container";
import { seedTwoFactor } from "./check-harness";

/**
 * Staff accounts for the back office gate and local work, written directly so no sign-up, email
 * or DNS check stands in the way. The TOTP secret is public on purpose, which is why this only
 * ever runs from the dev seed and refuses production. `apps/admin/a11y/staff.ts` mirrors it.
 */
const STAFF_TOTP_SECRET = "dev-seed-staff-totp-secret";
const SEEDED_STAFF = [
  { id: "seed-staff-manager", email: "staff-manager@example.com", role: "manager" },
  { id: "seed-staff-auditor", email: "staff-auditor@example.com", role: "auditor" },
] as const;

export async function seedDevStaff(password: string): Promise<void> {
  if (process.env.NODE_ENV === "production") return;

  for (const { id, email, role } of SEEDED_STAFF) {
    const [existing] = await db
      .select({ id: authSchema.user.id })
      .from(authSchema.user)
      .where(eq(authSchema.user.id, id))
      .limit(1);
    if (existing) continue;

    await db.insert(authSchema.user).values({
      id,
      name: `Seeded ${role}`,
      email,
      emailVerified: true,
      locale: "en",
      role: "admin",
      twoFactorEnabled: true,
    });
    await db.insert(authSchema.account).values({
      id: `${id}-account`,
      accountId: id,
      providerId: "credential",
      userId: id,
      password: await hashPassword(password),
    });
    await seedTwoFactor(id, STAFF_TOTP_SECRET, true);
    await db.insert(staffSchema.staffMember).values({ userId: id, role, source: "console" });

    const stale = await di.PolicyAcceptanceService.getStaleTypes(id);
    if (stale.isSuccess && stale.getValue().length > 0) {
      await di.PolicyAcceptanceService.accept(id, stale.getValue());
    }
  }
}
