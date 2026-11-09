/**
 * Proves against a real Postgres and the real route stack what mocks cannot: a saved view belongs
 * to its owner in the WHERE of every query, a filter invalid for its screen never reaches the table,
 * saving twice under one name replaces, an erasure takes the views along, the inbox counts what SQL
 * finds and opens only what permissions open, and the two crons outside the sweep rail write their
 * heartbeat. Creates and removes its own rows.
 */

import { createRgpdInternalRoutes } from "@modules/rgpd/infrastructure/http/rgpd-internal.routes";
import { uuidv7 } from "@packages/ddd-kit";
import {
  authSchema,
  db,
  emailSchema,
  eq,
  inArray,
  outboxSchema,
  sql,
  staffSchema,
  sweepSchema,
} from "@packages/drizzle";
import { EventTypes } from "@packages/events";
import { Hono } from "hono";
import { di } from "../src/container";
import { flushNotificationEmailsRoutes } from "../src/shared/internal-routes/flush-notification-emails.route";
import { internalLayers } from "../src/shared/internal-routes/internal-layers";
import { adminProbes, appCall, codeOf } from "./admin-probes";
import { checkRecorder, internalApp, signedInternalRequest } from "./check-harness";
import { requireLocalDatabase } from "./require-local-database";

requireLocalDatabase("check-admin-workspace");

const RUN = crypto.randomUUID();
const PREFIX = `check-admin-workspace-${RUN}`;
const PROBE_TYPE = `check.admin-workspace.${RUN}`;
const HOUR_MS = 60 * 60 * 1000;

const { savedView, adminApproval } = staffSchema;
const { emailMessage } = emailSchema;
const { sweepRun } = sweepSchema;
const oe = outboxSchema.outboxEvent;

const probes = adminProbes(PREFIX);
const checks = checkRecorder();
const { check } = checks;
const staffIds: string[] = [];
const sweepLabels = ["rgpd-sweep", "flush-notification-emails", `${PREFIX}-sweep`];

async function cleanup(): Promise<void> {
  await db.delete(oe).where(eq(oe.eventType, PROBE_TYPE));
  if (staffIds.length > 0) {
    await db.delete(oe).where(inArray(sql`${oe.payload}->>'actorUserId'`, staffIds));
  }
  await db.delete(emailMessage).where(eq(emailMessage.toAddress, `${PREFIX}@example.com`));
  await db.delete(sweepRun).where(inArray(sweepRun.label, sweepLabels));
  await probes.cleanup();
}

async function staffCookie(name: string, role: "manager" | "auditor" | "support") {
  const probe = await probes.user(name);
  staffIds.push(probe.id);
  await db.insert(staffSchema.staffMember).values({ userId: probe.id, role, source: "console" });
  await db.update(authSchema.user).set({ role: "admin" }).where(eq(authSchema.user.id, probe.id));
  const cookie = await probes.sessionCookie(probe);
  await probes.enrolTwoFactor(probe);

  return { id: probe.id, cookie };
}

type ViewItem = { id: string; name: string; filters: unknown };

async function viewsOf(cookie: string): Promise<ViewItem[]> {
  const listed = await appCall(cookie, "GET", "/admin/views");
  const items: unknown = listed.body.items;

  return Array.isArray(items) ? items : [];
}

async function proveOwnership(ownerCookie: string, otherCookie: string, ownerId: string) {
  const saved = await appCall(ownerCookie, "POST", "/admin/views", {
    screen: "users",
    name: "Suspended",
    filters: { status: "suspended" },
  });
  check("a staff member saves a view", saved.status === 200, saved.body);

  const [mine] = await viewsOf(ownerCookie);
  check("the view reads back", mine?.name === "Suspended", mine);
  const id = mine?.id ?? "";

  check("another staff member does not list it", (await viewsOf(otherCookie)).length === 0);

  const stolen = await appCall(otherCookie, "DELETE", `/admin/views/${id}`);
  check(
    "another staff member's delete reads as not found",
    stolen.status === 404 && codeOf(stolen) === "ADMIN_VIEW_NOT_FOUND",
    stolen.body,
  );
  check("and the view is still there", (await viewsOf(ownerCookie)).length === 1);

  const replaced = await appCall(ownerCookie, "POST", "/admin/views", {
    screen: "users",
    name: "Suspended",
    filters: { status: "active" },
  });
  check("saving under the same name succeeds", replaced.status === 200, replaced.body);
  const afterReplace = await viewsOf(ownerCookie);
  check(
    "and replaces in place",
    afterReplace.length === 1 &&
      afterReplace[0]?.id === id &&
      JSON.stringify(afterReplace[0]?.filters) === '{"status":"active"}',
    afterReplace,
  );

  const sameNameOther = await appCall(otherCookie, "POST", "/admin/views", {
    screen: "users",
    name: "Suspended",
    filters: {},
  });
  check("a name is private to its owner", sameNameOther.status === 200, sameNameOther.body);

  const removed = await appCall(ownerCookie, "DELETE", `/admin/views/${id}`);
  check("the owner deletes the view", removed.status === 200, removed.body);
  check("it no longer lists", (await viewsOf(ownerCookie)).length === 0);

  const events = await db
    .select({ type: oe.eventType, payload: oe.payload })
    .from(oe)
    .where(eq(oe.aggregateId, id));
  check(
    "saving and deleting are announced, the refused delete is not",
    events.filter((row) => row.type === EventTypes.ADMIN_VIEW_SAVED).length === 2 &&
      events.filter((row) => row.type === EventTypes.ADMIN_VIEW_DELETED).length === 1,
    events,
  );
  check(
    "the events name the actor and never the filters",
    events.every((row) => {
      const text = JSON.stringify(row.payload);

      return text.includes(ownerId) && !text.includes("suspended") && !text.includes("active");
    }),
    events,
  );
}

async function proveFilters(cookie: string) {
  for (const [label, view] of [
    ["a filter of another screen", { screen: "orgs", name: "x", filters: { status: "active" } }],
    ["an unknown value", { screen: "users", name: "x", filters: { status: "deleted" } }],
    ["an unknown screen", { screen: "team", name: "x", filters: {} }],
    ["an invalid date", { screen: "audit", name: "x", filters: { from: "yesterday" } }],
    ["a blank name", { screen: "orgs", name: "  ", filters: {} }],
  ] as const) {
    const refused = await appCall(cookie, "POST", "/admin/views", view);
    check(`${label} is refused`, refused.status === 400, refused.body);
  }

  const rows = await db.select({ id: savedView.id }).from(savedView).where(eq(savedView.name, "x"));
  check("nothing refused reached the table", rows.length === 0, rows);
}

async function proveScreenGate() {
  const support = await staffCookie("no-audit", "support");
  const refused = await appCall(support.cookie, "POST", "/admin/views", {
    screen: "audit",
    name: "Hidden",
    filters: {},
  });
  check(
    "a screen the permissions do not open takes no view",
    codeOf(refused) === "ADMIN_STAFF_PERMISSION_FORBIDDEN",
    refused.body,
  );
}

async function proveErasure() {
  const erased = await staffCookie("erased", "manager");
  await appCall(erased.cookie, "POST", "/admin/views", {
    screen: "users",
    name: "Mine",
    filters: { q: "someone@example.com" },
  });
  await db
    .update(authSchema.user)
    .set({ pendingDeletionUntil: new Date(Date.now() - 1000) })
    .where(eq(authSchema.user.id, erased.id));

  const wiped = await di.RgpdService.executeAccountWipe({ userId: erased.id });
  check("the erasure runs", wiped.isSuccess, wiped.isFailure ? wiped.getError() : null);

  const rows = await db.select().from(savedView).where(eq(savedView.ownerId, erased.id));
  check("the erasure takes the staff member's views", rows.length === 0, rows);
}

async function seedDeadOutbox(): Promise<void> {
  await db.insert(oe).values({
    id: uuidv7(),
    eventType: PROBE_TYPE,
    aggregateId: `${PREFIX}-dead`,
    aggregateType: "probe",
    payload: {},
    metadata: {
      specversion: "1.0",
      source: "check/admin-workspace",
      datacontenttype: "application/json",
    },
    occurredAt: new Date(),
    attempts: 5,
    deadAt: new Date(),
  });
}

async function seedDeadEmail(): Promise<void> {
  await db.insert(emailMessage).values({
    id: uuidv7(),
    kind: "raw",
    toAddress: `${PREFIX}@example.com`,
    subject: "probe",
    payload: {},
    status: "dead",
  });
}

type InboxBody = {
  approvals: { status: string; total: number; items: { id: string }[] } | null;
  queues: { status: string; deadEvents: number; deadEmails: number } | null;
  sweeps: { status: string; items: { label: string; late: boolean }[] } | null;
};

async function inboxOf(cookie: string): Promise<InboxBody> {
  const { response } = await appCall(cookie, "GET", "/admin/inbox");

  return response.json();
}

async function proveInbox(manager: string, requesterId: string) {
  const before = await inboxOf(manager);

  await seedDeadOutbox();
  await seedDeadEmail();
  const now = new Date();
  await db.insert(sweepRun).values({
    label: `${PREFIX}-sweep`,
    startedAt: now,
    finishedAt: now,
    outcome: "failed",
    durationMs: 1,
    count: 0,
  });
  const live = crypto.randomUUID();
  const lapsed = crypto.randomUUID();
  await db.insert(adminApproval).values([
    {
      id: live,
      action: "staff.revoke",
      subjectId: `${PREFIX}-live`,
      params: {},
      requestedBy: requesterId,
      expiresAt: new Date(Date.now() + HOUR_MS),
    },
    {
      id: lapsed,
      action: "staff.revoke",
      subjectId: `${PREFIX}-lapsed`,
      params: {},
      requestedBy: requesterId,
      expiresAt: new Date(Date.now() - HOUR_MS),
    },
  ]);

  const after = await inboxOf(manager);
  check(
    "the inbox counts a dead event",
    after.queues?.deadEvents === (before.queues?.deadEvents ?? 0) + 1,
    after.queues,
  );
  check(
    "the inbox counts a dead email",
    after.queues?.deadEmails === (before.queues?.deadEmails ?? 0) + 1,
    after.queues,
  );
  check(
    "the inbox lists a failed job",
    after.sweeps?.items.some((run) => run.label === `${PREFIX}-sweep`) === true,
    after.sweeps,
  );
  check(
    "the inbox counts a live approval, never a lapsed one",
    after.approvals?.total === (before.approvals?.total ?? 0) + 1 &&
      after.approvals?.items.some((item) => item.id === live) === true &&
      !after.approvals?.items.some((item) => item.id === lapsed),
    after.approvals,
  );

  const auditor = await inboxOf((await staffCookie("reader", "auditor")).cookie);
  check(
    "an auditor reads operations and no approvals",
    auditor.approvals === null && auditor.queues !== null && auditor.sweeps !== null,
    auditor,
  );

  const support = await inboxOf((await staffCookie("helper", "support")).cookie);
  check(
    "a support member's inbox opens neither section",
    support.approvals === null && support.queues === null && support.sweeps === null,
    support,
  );

  const outsider = await probes.user("outsider");
  const refused = await appCall(await probes.sessionCookie(outsider), "GET", "/admin/inbox");
  check("a non-staff account is refused", refused.status === 403, refused.body);
}

async function proveHeartbeats() {
  await db.delete(sweepRun).where(inArray(sweepRun.label, sweepLabels.slice(0, 2)));

  const app = internalApp(
    new Hono()
      .route(
        "/",
        createRgpdInternalRoutes({
          internalGuards: internalLayers,
          ISweepRunStore: di.ISweepRunStore,
          IInstrumentation: di.IInstrumentation,
          RgpdService: di.RgpdService,
          rgpdSettings: di.rgpdSettings,
        }),
      )
      .route("/", flushNotificationEmailsRoutes),
  );
  for (const label of ["rgpd-sweep", "flush-notification-emails"]) {
    const dry = await signedInternalRequest(app, `/internal/${label}`, { dryRun: true });
    const noBeat = await db.select().from(sweepRun).where(eq(sweepRun.label, label));
    check(`a dry ${label} leaves no heartbeat`, dry.status === 200 && noBeat.length === 0, {
      status: dry.status,
      noBeat,
    });

    const real = await signedInternalRequest(app, `/internal/${label}`, {});
    const [beat] = await db.select().from(sweepRun).where(eq(sweepRun.label, label));
    check(`${label} writes its heartbeat`, real.status === 200 && beat?.outcome === "ok", {
      status: real.status,
      beat,
    });
  }
}

async function main(): Promise<void> {
  const owner = await staffCookie("owner", "manager");
  const other = await staffCookie("other", "manager");

  await proveOwnership(owner.cookie, other.cookie, owner.id);
  await proveFilters(owner.cookie);
  await proveScreenGate();
  await proveErasure();
  await proveInbox(owner.cookie, other.id);
  await proveHeartbeats();

  await cleanup();

  if (checks.failures > 0) {
    console.error(`\n${checks.failures} check(s) failed`);
    process.exit(1);
  }
  console.log("\nAll assertions passed, saved views and the inbox hold on the real stack.");
  process.exit(0);
}

main().catch(async (err) => {
  console.error("check-admin-workspace crashed:", err);
  await cleanup().catch(() => {});
  process.exit(1);
});
