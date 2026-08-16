import { Option } from "@packages/ddd-kit";
import { authSchema, db, eq, multiTenantSchema, notificationSchema, sql } from "@packages/drizzle";
import type { OutboxRecord } from "../src/shared/ports/outbox.port";
import { NoOpInstrumentation } from "../src/shared/services/noop-instrumentation";
import { NotificationFanoutSubscriber } from "../src/shared/services/notification-fanout-subscriber";

const email = process.env.SEED_EMAIL ?? "axxl41+dev@gmail.com";
const [user] = await db
  .select({ id: authSchema.user.id })
  .from(authSchema.user)
  .where(eq(authSchema.user.email, email))
  .limit(1);

if (!user) throw new Error(`no user for ${email}`);
const userId = user.id;

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
const a = await inspect("[1] activity in_app=false, event non force ->");
console.log(a.length === 0 ? "  OK: aucune notification creee" : "  ECHEC: notification creee");

await reset();
await setPreference("activity", "in_app", true);
await setPreference("activity", "email", false);
await fanout("user.export.completed");
const b = await inspect("[2] in_app=true, email=false ->");
console.log(
  b.length === 1 && b[0]?.emailPendingAt === null ? "  OK: creee sans email en attente" : "  ECHEC",
);

await reset();
await setPreference("security", "in_app", false);
await setPreference("security", "email", false);
await fanout("user.password_changed");
const c = await inspect("[3] security tout coupe, event force ->");
console.log(
  c.length === 1 && c[0]?.emailPendingAt !== null
    ? "  OK: forced ignore les preferences"
    : "  ECHEC",
);

await reset();
await fanout("user.export.completed");
const d = await inspect("[4] aucune preference enregistree ->");
console.log(d.length === 1 && d[0]?.emailPendingAt !== null ? "  OK: defaut actif" : "  ECHEC");

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
const e = await inspect("[5] audience org, preference user in_app=false ->");
console.log(e.length === 0 ? "  OK: le membre est filtre" : "  ECHEC: notification creee");

await reset();
await resetOrg();
await setPreference("org", "in_app", false);
await setOrgPreference("org", "in_app", true, true);
await db.transaction(async (tx) => subscriber.handle(orgEvent(), tx));
const f = await inspect("[6] org lock enabled=true contre user false ->");
console.log(f.length === 1 ? "  OK: le verrou org prime" : "  ECHEC");

await reset();
await resetOrg();
await setOrgPreference("org", "in_app", false, false);
await db.transaction(async (tx) => subscriber.handle(orgEvent(), tx));
const g = await inspect("[7] defaut org non verrouille a false, aucun choix user ->");
console.log(g.length === 0 ? "  OK: le defaut org s'applique" : "  ECHEC");

await reset();
await resetOrg();
await setPreference("org", "in_app", true);
await setOrgPreference("org", "in_app", false, false);
await db.transaction(async (tx) => subscriber.handle(orgEvent(), tx));
const h = await inspect("[8] choix user true contre defaut org non verrouille false ->");
console.log(h.length === 1 ? "  OK: le choix user prime sur un defaut org" : "  ECHEC");

await reset();
await resetOrg();
process.exit(0);
