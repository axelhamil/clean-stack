import { authSchema, db, eq } from "@packages/drizzle";
import { auth } from "../src/auth";
import { di } from "../src/container";
import { seedEmail } from "./seed-account";

// `.test` is reserved and can never carry an MX record, which the disposable-email
// guard reads as throwaway; the password must avoid the email local part, the user
// name and the app name (see shared/password-policy.ts).
const email = seedEmail();
const password = process.env.SEED_PASSWORD ?? "Nimbus-Harbor-42-Quartz";
const name = process.env.SEED_NAME ?? "Dev User";

const existing = await db
  .select()
  .from(authSchema.user)
  .where(eq(authSchema.user.email, email))
  .limit(1);

if (existing.length === 0) {
  await auth.api.signUpEmail({ body: { email, password, name } });
}

await db
  .update(authSchema.user)
  .set({ emailVerified: true })
  .where(eq(authSchema.user.email, email));

const [seeded] = await db
  .select({ id: authSchema.user.id, email: authSchema.user.email })
  .from(authSchema.user)
  .where(eq(authSchema.user.email, email))
  .limit(1);

// Verifying the email in SQL skips the /verify-email hook that records the initial
// policy acceptance — without this, every sign-in lands on the /legal/accept gate.
if (seeded) {
  const stale = await di.PolicyAcceptanceService.getStaleTypes(seeded.id);
  if (stale.isSuccess && stale.getValue().length > 0) {
    await di.PolicyAcceptanceService.accept(seeded.id, stale.getValue());
  }
}

console.log(JSON.stringify({ seeded, password }, null, 2));
process.exit(0);
