/**
 * Proves against a real Postgres and the real route stack what mocks cannot: a plan override
 * reaches every gate through the real entitlements until its end date and after a revocation
 * falls back, the partial index holds one open override per organization, the permission and
 * step-up gates refuse, and staff notes leave with the account erasure and with every path that
 * deletes an organization. Creates and removes its own rows.
 */

import { uuidv7 } from "@packages/ddd-kit";
import {
  authSchema,
  billingSchema,
  db,
  eq,
  inArray,
  like,
  multiTenantSchema,
  or,
  outboxSchema,
  staffSchema,
} from "@packages/drizzle";
import { EventTypes } from "@packages/events";
import { Hono } from "hono";
import { app } from "../src/app";
import { deleteOrgIfEmpty } from "../src/auth-queries";
import { di } from "../src/container";
import { env } from "../src/shared/env";
import { requireFeature, requirePlan } from "../src/shared/middleware/billing.middleware";
import { adminProbes, appCall, codeOf, freshIp } from "./admin-probes";
import { checkRecorder } from "./check-harness";
import { requireLocalDatabase } from "./require-local-database";

requireLocalDatabase("check-admin-accounts");

const RUN = crypto.randomUUID();
const PREFIX = `check-admin-accounts-${RUN}`;
const DAY_MS = 24 * 60 * 60 * 1000;
const inFuture = () => new Date(Date.now() + DAY_MS).toISOString();

const { organization, member } = multiTenantSchema;
const { planOverride, subscription } = billingSchema;
const { staffNote } = staffSchema;
const oe = outboxSchema.outboxEvent;

const probes = adminProbes(PREFIX);
const checks = checkRecorder();
const { check } = checks;
const orgIds: string[] = [];

async function cleanup(): Promise<void> {
  await db
    .delete(oe)
    .where(
      or(
        inArray(oe.eventType, [
          EventTypes.ADMIN_PLAN_OVERRIDE_SET,
          EventTypes.ADMIN_PLAN_OVERRIDE_REVOKED,
          EventTypes.ADMIN_NOTE_ADDED,
        ]),
        like(oe.aggregateId, `${PREFIX}%`),
      ),
    );
  if (orgIds.length > 0) {
    await db.delete(subscription).where(inArray(subscription.referenceId, orgIds));
    await db.delete(organization).where(inArray(organization.id, orgIds));
  }
  await db.delete(authSchema.user).where(like(authSchema.user.id, `${PREFIX}%`));
  await probes.cleanup();
}

async function seedOrg(name: string, memberIds: string[], role = "member"): Promise<string> {
  const id = `${PREFIX}-org-${name}`;
  orgIds.push(id);
  await db.insert(organization).values({ id, name, slug: id, createdAt: new Date() });
  for (const userId of memberIds) {
    await db.insert(member).values({
      id: `${id}-${userId}`,
      organizationId: id,
      userId,
      role,
      createdAt: new Date(),
    });
  }

  return id;
}

const gates = (orgId: string) =>
  new Hono<{ Variables: { orgId: string } }>()
    .use(async (c, next) => {
      c.set("orgId", orgId);
      await next();
    })
    .onError((err, c) => c.text(err.name, 402))
    .get("/plan", requirePlan("business"), (c) => c.text("open"))
    .get("/feature", requireFeature("sso"), (c) => c.text("open"));

async function gatesOpen(orgId: string): Promise<boolean> {
  const app = gates(orgId);
  const plan = await app.request("/plan");
  const feature = await app.request("/feature");

  return plan.status === 200 && feature.status === 200;
}

async function tierOf(orgId: string): Promise<string> {
  return (await di.EntitlementsService.getEntitlements(orgId)).tier;
}

async function openRows(orgId: string) {
  const rows = await db.select().from(planOverride).where(eq(planOverride.organizationId, orgId));

  return rows.filter((row) => row.revokedAt === null);
}

function confirmedCookie(name: string) {
  return probes.confirmedManager(name, (cookie) =>
    appCall(cookie, "POST", `/admin/orgs/${PREFIX}/plan-override`, {
      tier: "pro",
      expiresAt: inFuture(),
      note: "x",
    }),
  );
}

async function proveExpiryAndRevocation(cookie: string): Promise<void> {
  const org = await seedOrg("gates", []);
  const url = `/admin/orgs/${org}/plan-override`;

  check("an org with nothing is free", (await tierOf(org)) === "free");
  check("requirePlan and requireFeature refuse it", !(await gatesOpen(org)));

  const set = await appCall(cookie, "POST", url, {
    tier: "business",
    expiresAt: inFuture(),
    note: "Pilot until the contract is signed",
  });
  check("a manager after step-up sets an override", set.status === 200, set.body);
  check("getEntitlements returns it", (await tierOf(org)) === "business");
  check("requirePlan and requireFeature follow it", await gatesOpen(org));

  const detail = await appCall(cookie, "GET", `/admin/orgs/${org}`);
  const shown = JSON.stringify(detail.body);
  check(
    "the org 360 shows the effective plan, the override and its end",
    shown.includes('"plan":"business"') &&
      shown.includes('"planOverride":{') &&
      shown.includes("expiresAt"),
    detail.body,
  );

  const [written] = await openRows(org);
  if (!written) throw new Error("no override written");
  await db
    .update(planOverride)
    .set({ expiresAt: new Date(Date.now() - 1000) })
    .where(eq(planOverride.id, written.id));

  check("past its end the override falls back at read", (await tierOf(org)) === "free");
  check("the gates close with it", !(await gatesOpen(org)));
  const expiredDetail = await appCall(cookie, "GET", `/admin/orgs/${org}`);
  check(
    "the org 360 stops showing an expired override",
    JSON.stringify(expiredDetail.body).includes('"planOverride":null'),
    expiredDetail.body,
  );

  const revokeExpired = await appCall(cookie, "DELETE", url);
  check(
    "revoking an expired override answers not found",
    codeOf(revokeExpired) === "ADMIN_PLAN_OVERRIDE_NOT_FOUND",
    revokeExpired.body,
  );

  const reset = await appCall(cookie, "POST", url, {
    tier: "pro",
    expiresAt: inFuture(),
    note: "Second pilot",
  });
  check("an expired row does not block a new override", reset.status === 200, reset.body);
  check("the new override applies", (await tierOf(org)) === "pro");

  const replaced = await appCall(cookie, "POST", url, {
    tier: "business",
    expiresAt: inFuture(),
    note: "Third pilot",
  });
  check("a live override is replaced", replaced.status === 200, replaced.body);
  check("one override stays open", (await openRows(org)).length === 1);

  const announced = await db
    .select({ payload: oe.payload })
    .from(oe)
    .where(eq(oe.eventType, EventTypes.ADMIN_PLAN_OVERRIDE_SET));
  const ofOrg = announced.filter((row) => JSON.stringify(row.payload).includes(org));
  check("each set is announced in its transaction", ofOrg.length === 3, ofOrg);
  check(
    "the event names the actor and never the note",
    ofOrg.every((row) => {
      const text = JSON.stringify(row.payload);

      return text.includes("actorUserId") && !text.includes("pilot");
    }),
    ofOrg,
  );

  const revoked = await appCall(cookie, "DELETE", url);
  check("the override is revoked", revoked.status === 200, revoked.body);
  check("a revoked override falls back at once", (await tierOf(org)) === "free");
  check("nothing stays open", (await openRows(org)).length === 0);

  const missing = await appCall(cookie, "POST", `/admin/orgs/${PREFIX}-nope/plan-override`, {
    tier: "pro",
    expiresAt: inFuture(),
    note: "x",
  });
  check("an unknown org is refused", codeOf(missing) === "ADMIN_ORG_NOT_FOUND", missing.body);

  const past = await appCall(cookie, "POST", url, {
    tier: "pro",
    expiresAt: new Date(Date.now() - DAY_MS).toISOString(),
    note: "x",
  });
  check("an end date in the past is refused", past.status === 400, past.status);
}

async function proveSubscriptionFallback(): Promise<void> {
  const org = await seedOrg("subscribed", []);
  await db.insert(subscription).values({
    id: `${org}-sub`,
    plan: "pro",
    referenceId: org,
    status: "active",
  });
  const overrideId = uuidv7();
  await db.insert(planOverride).values({
    id: overrideId,
    organizationId: org,
    tier: "business",
    expiresAt: new Date(Date.now() + DAY_MS),
    note: "Pilot",
  });

  const during = await di.EntitlementsService.getEntitlements(org);
  check(
    "the override wins over the subscription and keeps its status",
    during.tier === "business" && during.status === "active" && during.maxMembers === null,
    during,
  );

  await db
    .update(planOverride)
    .set({ expiresAt: new Date(Date.now() - 1000) })
    .where(eq(planOverride.id, overrideId));
  const after = await di.EntitlementsService.getEntitlements(org);
  check(
    "past its end the subscription is back",
    after.tier === "pro" && after.status === "active",
    after,
  );
}

async function proveOneOpenPerOrg(): Promise<void> {
  const org = await seedOrg("index", []);
  const row = {
    organizationId: org,
    tier: "pro",
    expiresAt: new Date(Date.now() + DAY_MS),
    note: "x",
  };

  await db.insert(planOverride).values({ ...row, id: uuidv7() });
  const second = await db
    .insert(planOverride)
    .values({ ...row, id: uuidv7() })
    .then(() => "written")
    .catch((err: { cause?: { code?: string } }) => err.cause?.code);
  check("the index refuses a second open override", second === "23505", second);

  const conflict = await di.IPlanOverrideStore.insert({
    ...row,
    id: uuidv7(),
    createdBy: `${PREFIX}-manager`,
  });
  check(
    "the store reports it as nothing written",
    conflict.isSuccess && conflict.getValue() === false,
  );

  await db
    .update(planOverride)
    .set({ revokedAt: new Date() })
    .where(eq(planOverride.organizationId, org));
  const after = await db
    .insert(planOverride)
    .values({ ...row, id: uuidv7() })
    .then(() => "written");
  check("a closed row leaves room for the next one", after === "written");

  const blocked = await Promise.all(
    [0, 1].map(() =>
      di.PlanOverrideService.set({
        actorUserId: `${PREFIX}-manager`,
        organizationId: org,
        tier: "business",
        expiresAt: new Date(Date.now() + DAY_MS),
        note: "race",
      }),
    ),
  );
  check(
    "two concurrent sets leave one open row",
    (await openRows(org)).length === 1,
    blocked.map((result) => result.isSuccess),
  );
}

async function proveSeatCap(cookie: string, ownerId: string): Promise<void> {
  const extras = [await probes.user("seat-a"), await probes.user("seat-b")];
  const org = await seedOrg("seats", []);
  await db.insert(member).values({
    id: `${org}-owner`,
    organizationId: org,
    userId: ownerId,
    role: "owner",
    createdAt: new Date(),
  });
  for (const extra of extras) {
    await db.insert(member).values({
      id: `${org}-${extra.id}`,
      organizationId: org,
      userId: extra.id,
      role: "member",
      createdAt: new Date(),
    });
  }

  const invite = () =>
    app.request(
      "/api/auth/organization/invite-member",
      {
        method: "POST",
        headers: {
          cookie,
          origin: env.CORS_ORIGIN?.[0] ?? "http://localhost:5173",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          email: `${PREFIX}-invited-${uuidv7()}@example.com`,
          role: "member",
          organizationId: org,
        }),
      },
      { server: { requestIP: () => ({ address: freshIp(), family: "IPv4", port: 1 }) } },
    );

  const refused = await invite();
  const refusal = await refused.json().catch(() => null);
  check(
    "at the free cap an invitation is refused with a 402 and the seat code",
    refused.status === 402 && refusal?.code === "ORGANIZATION_SEAT_PAYMENT_REQUIRED",
    { status: refused.status, body: refusal },
  );

  await db.insert(planOverride).values({
    id: uuidv7(),
    organizationId: org,
    tier: "pro",
    expiresAt: new Date(Date.now() + DAY_MS),
    note: "More seats",
  });
  const allowed = await invite();
  check("the seat cap follows the override", allowed.status === 200, allowed.status);
}

async function notesOf(column: "user" | "org", id: string) {
  return db
    .select({ id: staffNote.id })
    .from(staffNote)
    .where(eq(column === "user" ? staffNote.userId : staffNote.organizationId, id));
}

async function proveNotes(cookie: string): Promise<void> {
  const subject = await probes.user("noted");
  const org = await seedOrg("noted", [subject.id]);

  for (const [url, body] of [
    [`/admin/users/${subject.id}/notes`, "Asked about an invoice"],
    [`/admin/orgs/${org}/notes`, "Renewal call next week"],
  ] as const) {
    const added = await appCall(cookie, "POST", url, { body });
    check(`a note is added through ${url.split("/")[2]}`, added.status === 200, added.body);

    const listed = await appCall(cookie, "GET", url);
    check("the note reads back", JSON.stringify(listed.body).includes(body), listed.body);
  }

  const events = await db
    .select({ payload: oe.payload })
    .from(oe)
    .where(eq(oe.eventType, EventTypes.ADMIN_NOTE_ADDED));
  const ours = events.filter((row) => {
    const text = JSON.stringify(row.payload);

    return text.includes(subject.id) || text.includes(org);
  });
  check("each note is announced", ours.length === 2, ours);
  check(
    "the event never holds the body",
    ours.every((row) => !JSON.stringify(row.payload).includes("invoice")),
  );

  const missing = await appCall(cookie, "POST", `/admin/users/${PREFIX}-nope/notes`, { body: "x" });
  check("a note on nobody is refused", codeOf(missing) === "ADMIN_USER_NOT_FOUND", missing.body);
}

async function seedNote(subject: { userId?: string; organizationId?: string }): Promise<void> {
  await db.insert(staffNote).values({ id: uuidv7(), body: "Probe", ...subject });
}

async function proveWipes(cookie: string, ownerId: string): Promise<void> {
  const erased = await probes.user("erased");
  await db
    .update(authSchema.user)
    .set({ pendingDeletionUntil: new Date(Date.now() - 1000) })
    .where(eq(authSchema.user.id, erased.id));
  const personal = await seedOrg("personal", [erased.id], "owner");
  await db
    .update(organization)
    .set({ slug: `personal-${personal}` })
    .where(eq(organization.id, personal));
  await seedNote({ userId: erased.id });
  await seedNote({ organizationId: personal });
  await db.insert(planOverride).values({
    id: uuidv7(),
    organizationId: personal,
    tier: "pro",
    expiresAt: new Date(Date.now() + DAY_MS),
    note: "x",
  });

  const wiped = await di.RgpdService.executeAccountWipe({ userId: erased.id });
  check("the erasure runs", wiped.isSuccess, wiped.isFailure ? wiped.getError() : null);
  check("the erasure removes the user's notes", (await notesOf("user", erased.id)).length === 0);
  check(
    "the erasure removes the notes of the org it deletes",
    (await notesOf("org", personal)).length === 0,
  );
  check("the override goes with the org", (await openRows(personal)).length === 0);

  const afterErasure = await appCall(cookie, "POST", `/admin/users/${erased.id}/notes`, {
    body: "x",
  });
  check(
    "an erased account takes no new note",
    codeOf(afterErasure) === "ADMIN_USER_NOT_FOUND",
    afterErasure.body,
  );

  const emptied = await seedOrg("emptied", []);
  await seedNote({ organizationId: emptied });
  check("the last member leaving deletes the org", await deleteOrgIfEmpty(emptied));
  check("that deletion removes the org's notes", (await notesOf("org", emptied)).length === 0);

  const owned = await seedOrg("owned", []);
  await db.insert(member).values({
    id: `${owned}-owner`,
    organizationId: owned,
    userId: ownerId,
    role: "owner",
    createdAt: new Date(),
  });
  await seedNote({ organizationId: owned });
  const deleted = await appCall(cookie, "POST", "/api/auth/organization/delete", {
    organizationId: owned,
  });
  check("the owner deletes the org through the auth route", deleted.status === 200, deleted.body);
  check("the auth route removes the org's notes", (await notesOf("org", owned)).length === 0);
}

async function proveAuditorReadsOnly(): Promise<void> {
  const auditor = await probes.user("auditor");
  await db
    .insert(staffSchema.staffMember)
    .values({ userId: auditor.id, role: "auditor", source: "console" });
  const cookie = await probes.sessionCookie(auditor);
  await probes.enrolTwoFactor(auditor);
  const org = await seedOrg("audited", []);
  await seedNote({ organizationId: org });

  const read = await appCall(cookie, "GET", `/admin/orgs/${org}/notes`);
  check("an auditor reads the notes", read.status === 200, read.body);

  const write = await appCall(cookie, "POST", `/admin/orgs/${org}/notes`, { body: "x" });
  check(
    "an auditor writes no note",
    codeOf(write) === "ADMIN_STAFF_PERMISSION_FORBIDDEN",
    write.body,
  );

  const set = await appCall(cookie, "POST", `/admin/orgs/${org}/plan-override`, {
    tier: "pro",
    expiresAt: inFuture(),
    note: "x",
  });
  check(
    "an auditor sets no override",
    codeOf(set) === "ADMIN_STAFF_PERMISSION_FORBIDDEN",
    set.body,
  );
}

async function main(): Promise<void> {
  const { cookie, id, unconfirmedRefusal } = await confirmedCookie("manager");
  check(
    "an override without a step-up is refused",
    unconfirmedRefusal === "ADMIN_REAUTH_REQUIRED",
    unconfirmedRefusal,
  );

  await proveExpiryAndRevocation(cookie);
  await proveSubscriptionFallback();
  await proveOneOpenPerOrg();
  await proveSeatCap(cookie, id);
  await proveNotes(cookie);
  await proveWipes(cookie, id);
  await proveAuditorReadsOnly();
  await cleanup();

  if (checks.failures > 0) {
    console.error(`\n${checks.failures} check(s) failed`);
    process.exit(1);
  }
  console.log("\nAll assertions passed, plan overrides and staff notes hold on the real stack.");
  process.exit(0);
}

main().catch(async (err) => {
  console.error("check-admin-accounts crashed:", err);
  await cleanup().catch(() => {});
  process.exit(1);
});
