import { authSchema, db, eq, inArray, or, outboxSchema, sql, staffSchema } from "@packages/drizzle";
import { hashPassword, symmetricEncrypt } from "better-auth/crypto";
import { auth } from "../src/auth";
import { authSecretKey } from "../src/shared/auth/auth-secrets";
import { env } from "../src/shared/env";

const PASSWORD = "check-admin-probe-password";

export interface AdminProbe {
  id: string;
  email: string;
  totpSecret: string;
}

export function adminProbes(prefix: string) {
  const created: string[] = [];

  async function signIn(email: string): Promise<Response> {
    return auth.api.signInEmail({ body: { email, password: PASSWORD }, asResponse: true });
  }

  async function sessionCookie(probe: AdminProbe): Promise<string> {
    const response = await signIn(probe.email);
    const token = response.headers
      .getSetCookie()
      .map((cookie) => cookie.split(";")[0] ?? "")
      .find((pair) => pair.includes("session_token"));
    if (!token) throw new Error(`no session cookie for ${probe.email}: ${response.status}`);

    return token;
  }

  async function user(name: string): Promise<AdminProbe> {
    const id = `${prefix}-${name}`;
    const email = `${id}@example.com`;
    created.push(id);
    await db.insert(authSchema.user).values({
      id,
      name,
      email,
      emailVerified: true,
      locale: "en",
    });
    await db.insert(authSchema.account).values({
      id: `${id}-account`,
      accountId: id,
      providerId: "credential",
      userId: id,
      password: await hashPassword(PASSWORD),
    });

    return { id, email, totpSecret: `${id}-totp-secret` };
  }

  async function enrolTwoFactor(probe: AdminProbe): Promise<void> {
    await db.insert(authSchema.twoFactor).values({
      id: `${probe.id}-two-factor`,
      userId: probe.id,
      secret: await symmetricEncrypt({ key: authSecretKey(env), data: probe.totpSecret }),
      backupCodes: "[]",
      verified: true,
    });
    await db
      .update(authSchema.user)
      .set({ twoFactorEnabled: true })
      .where(eq(authSchema.user.id, probe.id));
  }

  async function manager(name: string): Promise<AdminProbe> {
    const probe = await user(name);
    await db
      .insert(staffSchema.staffMember)
      .values({ userId: probe.id, role: "manager", source: "console" });
    await db.update(authSchema.user).set({ role: "admin" }).where(eq(authSchema.user.id, probe.id));

    return probe;
  }

  async function cleanup(): Promise<void> {
    if (created.length === 0) return;

    const { aggregateId, payload } = outboxSchema.outboxEvent;
    await db
      .delete(outboxSchema.outboxEvent)
      .where(or(inArray(aggregateId, created), inArray(sql`${payload}->>'userId'`, created)));
    await db.execute(
      sql`DELETE FROM email_message WHERE ${or(...created.map((id) => sql`to_address = ${`${id}@example.com`}`))}`,
    );
    await db.delete(authSchema.user).where(inArray(authSchema.user.id, created));
  }

  async function eventCount(type: string, userId: string): Promise<number> {
    const { eventType, payload } = outboxSchema.outboxEvent;
    const rows = await db
      .select({ id: outboxSchema.outboxEvent.id })
      .from(outboxSchema.outboxEvent)
      .where(sql`${eventType} = ${type} AND ${payload}->>'userId' = ${userId}`);

    return rows.length;
  }

  return { user, manager, enrolTwoFactor, signIn, sessionCookie, cleanup, eventCount };
}
