import { Option } from "@packages/ddd-kit";
import { db, eq, multiTenantSchema, notificationSchema, sql } from "@packages/drizzle";
import type { OutboxRecord } from "../src/shared/ports/outbox.port";
import { NoOpInstrumentation } from "../src/shared/services/noop-instrumentation";
import { NotificationFanoutSubscriber } from "../src/shared/services/notification-fanout-subscriber";
import { checkRecorder, findSeededUserId } from "./check-harness";
import { requireLocalDatabase } from "./require-local-database";

requireLocalDatabase("check-fanout-preferences");

const checks = checkRecorder();
const { check } = checks;
const userId = await findSeededUserId();

const subscriber = new NotificationFanoutSubscriber(new NoOpInstrumentation());

const event = (eventType: string): OutboxRecord => ({
  id: "01J000000000000000000000",
  eventType,
  aggregateId: `probe-${eventType}`,
  aggregateType: "user",
  organizationId: Option.none(),
  payload: { userId },
  metadata: {} as OutboxRecord["metadata"],
  occurredAt: new Date(),
  attempts: 0,
});

const reset = async () => {
  await db.execute(sql`DELETE FROM notification WHERE user_id = ${userId}`);
  await db.execute(
    sql`DELETE FROM notification_preference WHERE scope = 'user' AND scope_id = ${userId}`,
  );
};

const setPreference = (category: string, channel: string, enabled: boolean) =>
  db.execute(sql`
    INSERT INTO notification_preference (id, scope, scope_id, category, channel, enabled, frequency, locked)
    VALUES (gen_random_uuid()::text, 'user', ${userId}, ${category}, ${channel}, ${enabled}, 'immediate', false)
  `);

const fanout = (eventType: string) =>
  db.transaction(async (tx) => subscriber.handle(event(eventType), tx));

const inspect = async (label: string) => {
  const rows = await db
    .select({
      eventType: notificationSchema.notification.eventType,
      emailPendingAt: notificationSchema.notification.emailPendingAt,
    })
    .from(notificationSchema.notification)
    .where(eq(notificationSchema.notification.userId, userId));
  console.log(
    label,
    JSON.stringify(rows.map((r) => ({ e: r.eventType, mail: r.emailPendingAt !== null }))),
  );
  return rows;
};

await reset();
await setPreference("activity", "in_app", false);
await fanout("user.export.completed");
const a = await inspect("[1] activity in_app=false, non-forced event ->");
check("no notification created", a.length === 0);

await reset();
await setPreference("activity", "in_app", true);
await setPreference("activity", "email", false);
await fanout("user.export.completed");
const b = await inspect("[2] in_app=true, email=false ->");
check("created with no pending email", b.length === 1 && b[0]?.emailPendingAt === null);

await reset();
await setPreference("security", "in_app", false);
await setPreference("security", "email", false);
await fanout("user.password_changed");
const c = await inspect("[3] security fully off, forced event ->");
check("forced ignores the preferences", c.length === 1 && c[0]?.emailPendingAt !== null);

await reset();
await fanout("user.export.completed");
const d = await inspect("[4] no stored preference ->");
check("enabled by default", d.length === 1 && d[0]?.emailPendingAt !== null);

const [membership] = await db
  .select({ organizationId: multiTenantSchema.member.organizationId })
  .from(multiTenantSchema.member)
  .where(eq(multiTenantSchema.member.userId, userId))
  .limit(1);

if (!membership) throw new Error("no membership for the seeded user");
const organizationId = membership.organizationId;

const orgEvent = (): OutboxRecord => ({
  ...event("org.member.joined"),
  organizationId: Option.some(organizationId),
});

const setOrgPreference = (category: string, channel: string, enabled: boolean, locked: boolean) =>
  db.execute(sql`
    INSERT INTO notification_preference (id, scope, scope_id, category, channel, enabled, frequency, locked)
    VALUES (gen_random_uuid()::text, 'org', ${organizationId}, ${category}, ${channel}, ${enabled}, 'immediate', ${locked})
  `);

const resetOrg = () =>
  db.execute(
    sql`DELETE FROM notification_preference WHERE scope = 'org' AND scope_id = ${organizationId}`,
  );

await reset();
await resetOrg();
await setPreference("org", "in_app", false);
await db.transaction(async (tx) => subscriber.handle(orgEvent(), tx));
const e = await inspect("[5] org audience, user preference in_app=false ->");
check("the member is filtered out", e.length === 0);

await reset();
await resetOrg();
await setPreference("org", "in_app", false);
await setOrgPreference("org", "in_app", true, true);
await db.transaction(async (tx) => subscriber.handle(orgEvent(), tx));
const f = await inspect("[6] org lock enabled=true against user false ->");
check("the org lock wins", f.length === 1);

await reset();
await resetOrg();
await setOrgPreference("org", "in_app", false, false);
await db.transaction(async (tx) => subscriber.handle(orgEvent(), tx));
const g = await inspect("[7] unlocked org default false, no user choice ->");
check("the org default applies", g.length === 0);

await reset();
await resetOrg();
await setPreference("org", "in_app", true);
await setOrgPreference("org", "in_app", false, false);
await db.transaction(async (tx) => subscriber.handle(orgEvent(), tx));
const h = await inspect("[8] user choice true against unlocked org default false ->");
check("the user choice wins over an org default", h.length === 1);

await reset();
await resetOrg();

if (checks.failures > 0) {
  console.error("check:fanout FAILED");
  process.exit(1);
}
console.log("check:fanout OK");
