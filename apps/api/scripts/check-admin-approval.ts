/**
 * Proves against a real Postgres and the real route stack what mocks cannot: the self-approval
 * CHECK, one winner among racing decisions, the expiry predicate and sweep, a refused action
 * rolled back then recorded by a second unit, stored params revalidated, a permission lost before
 * the decision, and who the notification reaches. Creates and removes its own probe users.
 */

import { APPROVAL_ACTIONS, authorizeStaff } from "@packages/access-control";
import { Option, Result } from "@packages/ddd-kit";
import {
  and,
  auditLogSchema,
  authSchema,
  db,
  eq,
  inArray,
  multiTenantSchema,
  notificationSchema,
  resolveExecutor,
  sql,
  staffSchema,
} from "@packages/drizzle";
import { EventTypes } from "@packages/events";
import { Hono } from "hono";
import { di } from "../src/container";
import { adminInternalRoutes } from "../src/modules/admin/internal.routes";
import { env } from "../src/shared/env";
import { timeIdCursorSchema } from "../src/shared/pagination/time-id-cursor";
import { staffRecipients } from "../src/shared/services/staff-recipients";
import { staffAccessOf } from "../src/shared/staff-access";
import {
  type AdminProbe,
  type AppCall,
  adminProbes,
  appCall,
  codeAt,
  codeOf,
  currentCounter,
} from "./admin-probes";
import { checkRecorder, internalApp, signedInternalRequest } from "./check-harness";
import { requireLocalDatabase } from "./require-local-database";

requireLocalDatabase("check-admin-approval");

const probes = adminProbes(`check-admin-approval-${crypto.randomUUID()}`);
const checks = checkRecorder();
const { check } = checks;
const { adminApproval, staffMember, staffPermissionOverride } = staffSchema;

const RACERS = 6;
const SWEEP_PATH = "/internal/sweep-admin-approvals";
const sweepApp = internalApp(new Hono().route("/", adminInternalRoutes));

interface Staff {
  probe: AdminProbe;
  cookie: string;
}

async function confirm(probe: AdminProbe): Promise<Staff> {
  const cookie = await probes.sessionCookie(probe);
  await probes.enrolTwoFactor(probe);
  const code = await codeAt(probe, currentCounter());
  const confirmed = await appCall(cookie, "POST", "/admin/step-up", { code });
  if (confirmed.status !== 200) throw new Error(`step-up refused: ${confirmed.status}`);

  return { probe, cookie };
}

async function manager(name: string): Promise<Staff> {
  return confirm(await probes.manager(name));
}

async function grant(userId: string, permission: string, effect: "grant" | "deny"): Promise<void> {
  await db
    .insert(staffPermissionOverride)
    .values({ id: crypto.randomUUID(), userId, permission, effect });
}

async function moderatorApprover(name: string): Promise<Staff> {
  const probe = await probes.manager(name);
  await db.update(staffMember).set({ role: "support" }).where(eq(staffMember.userId, probe.id));
  await grant(probe.id, "approvals.decide", "grant");

  return confirm(probe);
}

async function requestBan(requester: Staff, subjectId: string): Promise<string> {
  const asked = await appCall(requester.cookie, "POST", `/admin/users/${subjectId}/ban`, {
    reason: "check-admin-approval probe",
  });
  if (asked.status !== 202 || !asked.body.approvalId) {
    throw new Error(`no approval opened: ${asked.status} ${JSON.stringify(asked.body)}`);
  }

  return asked.body.approvalId;
}

function decide(approver: Staff, id: string, decision = "approve"): Promise<AppCall> {
  return appCall(approver.cookie, "POST", `/admin/approvals/${id}/decide`, {
    decision,
    note: "check-admin-approval note",
  });
}

async function rowOf(id: string) {
  const [row] = await db.select().from(adminApproval).where(eq(adminApproval.id, id));
  if (!row) throw new Error(`no approval ${id}`);

  return row;
}

async function banOf(userId: string): Promise<boolean | null | undefined> {
  const [row] = await db
    .select({ banned: authSchema.user.banned })
    .from(authSchema.user)
    .where(eq(authSchema.user.id, userId));

  return row?.banned;
}

async function eventsOf(type: string, subjectId: string, approvalId: string) {
  const payloads = await probes.eventPayloads(type, subjectId);

  return payloads.filter(
    (payload) =>
      typeof payload === "object" &&
      payload !== null &&
      "approvalId" in payload &&
      payload.approvalId === approvalId,
  );
}

async function proveOffChangesNothing(): Promise<void> {
  const requester = await manager("off-requester");
  const target = await probes.user("off-target");
  Object.assign(env, { ADMIN_APPROVAL_ENABLED: false });

  const banned = await appCall(requester.cookie, "POST", `/admin/users/${target.id}/ban`, {
    reason: "probe",
  });
  Object.assign(env, { ADMIN_APPROVAL_ENABLED: true });

  check("off, the ban answers 200 as today", banned.status === 200, banned.body);
  check("off, the ban happens at once", (await banOf(target.id)) === true);
  const rows = await db.select().from(adminApproval).where(eq(adminApproval.subjectId, target.id));
  check("off, no approval is stored", rows.length === 0);
}

async function proveSelfApprovalRefused(): Promise<void> {
  const requester = await manager("self-requester");
  const target = await probes.user("self-target");
  const id = await requestBan(requester, target.id);
  check("the gated ban waits", (await banOf(target.id)) === false);
  check(
    "the request is announced",
    (await eventsOf(EventTypes.ADMIN_APPROVAL_REQUESTED, target.id, id)).length === 1,
  );

  const refused = await decide(requester, id);
  check(
    "the service refuses the requester deciding",
    codeOf(refused) === "ADMIN_APPROVAL_SELF_DECISION_FORBIDDEN",
    refused.body,
  );
  check("the refused decision runs nothing", (await banOf(target.id)) === false);

  const atDatabase = await db
    .update(adminApproval)
    .set({ decidedBy: requester.probe.id })
    .where(eq(adminApproval.id, id))
    .then(
      () => "written",
      (err: { cause?: { constraint?: string } }) => err.cause?.constraint,
    );
  check("the database refuses it too", atDatabase === "admin_approval_four_eyes_check", atDatabase);

  const unknownStatus = await db
    .update(adminApproval)
    .set({ status: "done" })
    .where(eq(adminApproval.id, id))
    .then(
      () => "written",
      (err: { cause?: { constraint?: string } }) => err.cause?.constraint,
    );
  check("the status list is closed", unknownStatus === "admin_approval_status_check");

  const asOwnSubject = await appCall(
    requester.cookie,
    "POST",
    `/admin/users/${requester.probe.id}/ban`,
    { reason: "probe" },
  );
  check(
    "nobody asks a colleague to act on their own account",
    codeOf(asOwnSubject) === "ADMIN_APPROVAL_SELF_SUBJECT_FORBIDDEN",
    asOwnSubject.body,
  );
}

async function proveOneWinner(): Promise<void> {
  const requester = await manager("race-requester");
  const target = await probes.user("race-target");
  const id = await requestBan(requester, target.id);
  const approvers = await Promise.all(
    Array.from({ length: RACERS }, (_, n) => manager(`race-approver-${n}`)),
  );

  const results = await Promise.all(approvers.map((approver) => decide(approver, id)));
  const winners = results.filter((result) => result.status === 200);
  const losers = results.filter((result) => codeOf(result) === "ADMIN_APPROVAL_DECIDED_CONFLICT");
  check(
    "exactly one racing decision wins",
    winners.length === 1 && losers.length === RACERS - 1,
    results.map((result) => result.status),
  );

  const row = await rowOf(id);
  check("the row ends executed", row.status === "executed", row.status);
  check("the action ran", (await banOf(target.id)) === true);
  check("it ran once", (await probes.eventCount(EventTypes.ADMIN_USER_BANNED, target.id)) === 1);
  const executed = await eventsOf(EventTypes.ADMIN_APPROVAL_EXECUTED, target.id, id);
  check("one execution is announced", executed.length === 1);
  check(
    "the actor is the winner",
    approvers.some(
      (approver, n) =>
        results[n]?.status === 200 &&
        JSON.stringify(executed[0]).includes(`"actorUserId":"${approver.probe.id}"`),
    ),
    executed[0],
  );
}

async function proveExpiry(): Promise<void> {
  const requester = await manager("expiry-requester");
  const approver = await manager("expiry-approver");
  const target = await probes.user("expiry-target");
  const id = await requestBan(requester, target.id);
  await db
    .update(adminApproval)
    .set({ expiresAt: new Date(Date.now() - 60_000) })
    .where(eq(adminApproval.id, id));

  const refused = await decide(approver, id);
  check(
    "an overdue request cannot be decided before the sweep",
    codeOf(refused) === "ADMIN_APPROVAL_EXPIRED_CONFLICT",
    refused.body,
  );
  const claim = await di.IApprovalStore.claim({
    id,
    status: "approved",
    decidedBy: approver.probe.id,
    note: "probe",
  });
  check("the claim itself skips an overdue row", claim.getValue().isNone());

  const swept = await signedInternalRequest(sweepApp, SWEEP_PATH, {});
  check("the sweep answers", swept.status === 200, swept.status);
  check("the sweep expires the row", (await rowOf(id)).status === "expired");
  const expired = await eventsOf(EventTypes.ADMIN_APPROVAL_EXPIRED, target.id, id);
  check(
    "the expiry is announced with no actor",
    expired.length === 1 && JSON.stringify(expired[0]).includes('"actorUserId":null'),
    expired,
  );

  await signedInternalRequest(sweepApp, SWEEP_PATH, {});
  check(
    "a second sweep announces nothing more",
    (await eventsOf(EventTypes.ADMIN_APPROVAL_EXPIRED, target.id, id)).length === 1,
  );
  check("nothing ran", (await banOf(target.id)) === false);
}

async function proveFailureRollsBackThenMarks(): Promise<void> {
  const requester = await manager("failure-requester");
  const approver = await manager("failure-approver");
  const target = await probes.user("failure-target");
  await db.insert(staffMember).values({ userId: target.id, role: "support", source: "console" });
  const asked = await appCall(requester.cookie, "PUT", `/admin/staff/${target.id}/role`, {
    role: "manager",
  });
  const id = asked.body.approvalId ?? "";
  check(
    "the request stores the role it starts from",
    JSON.stringify((await rowOf(id)).params).includes('"fromRole":"support"'),
  );
  await db
    .update(staffMember)
    .set({ revokedAt: new Date() })
    .where(eq(staffMember.userId, target.id));

  const refused = await decide(approver, id);
  check(
    "an old request cannot resurrect a revoked person",
    codeOf(refused) === "ADMIN_STAFF_ROLE_CHANGED_CONFLICT",
    refused.body,
  );
  check("the action left nothing", (await staffRole(target.id)) === "support");
  const [held] = await db
    .select({ revokedAt: staffMember.revokedAt })
    .from(staffMember)
    .where(eq(staffMember.userId, target.id));
  check("the person stays revoked", held?.revokedAt instanceof Date);
  check(
    "the rolled back decision left no event",
    (await eventsOf(EventTypes.ADMIN_APPROVAL_DECIDED, target.id, id)).length === 0,
  );

  const row = await rowOf(id);
  check("a second unit marks it failed", row.status === "failed", row.status);
  check(
    "the reason is stored",
    row.failureReason === "ADMIN_STAFF_ROLE_CHANGED_CONFLICT",
    row.failureReason,
  );
  check("the failure names who decided", row.decidedBy === approver.probe.id);
  check(
    "the failure is announced",
    (await eventsOf(EventTypes.ADMIN_APPROVAL_FAILED, target.id, id)).length === 1,
  );
  const again = await decide(await manager("failure-second"), id);
  check("a failed request stays closed", codeOf(again) === "ADMIN_APPROVAL_DECIDED_CONFLICT");
}

async function moderator(name: string): Promise<Staff> {
  const probe = await probes.manager(name);
  await db.update(staffMember).set({ role: "support" }).where(eq(staffMember.userId, probe.id));

  return confirm(probe);
}

async function proveSubjectStaysOut(): Promise<void> {
  const requester = await manager("subject-requester");
  const subject = await manager("subject-target");
  const id = await requestBan(requester, subject.probe.id);

  for (const decision of ["approve", "reject"]) {
    const refused = await decide(subject, id, decision);
    check(
      `the subject cannot ${decision} a request about themselves`,
      codeOf(refused) === "ADMIN_APPROVAL_SUBJECT_DECISION_FORBIDDEN",
      refused.body,
    );
  }
  check("the subject's refusal leaves it pending", (await rowOf(id)).status === "pending");

  const requested = EventTypes.ADMIN_APPROVAL_REQUESTED;
  await di.NotificationFanoutSubscriber.handle({
    eventId: crypto.randomUUID(),
    eventType: requested,
    aggregateId: id,
    aggregateType: "admin_approval",
    payload: {
      approvalId: id,
      action: "user.ban_permanent",
      requesterUserId: requester.probe.id,
      userId: subject.probe.id,
      actorUserId: requester.probe.id,
    },
    dateOccurred: new Date(),
  });
  check(
    "a staff subject is left out of the notice",
    !(await hasNotification(subject.probe.id, requested)),
  );
}

async function proveBanGateCoversEveryBypass(): Promise<void> {
  const requester = await manager("bypass-requester");
  const staffTarget = await probes.manager("bypass-staff");
  const timed = { reason: "probe", expiresIn: 3600 };

  const onStaff = await appCall(
    requester.cookie,
    "POST",
    `/admin/users/${staffTarget.id}/ban`,
    timed,
  );
  check("a timed ban of staff waits for a colleague", onStaff.status === 202, onStaff.body);
  check("the timed ban of staff has not landed", (await banOf(staffTarget.id)) === false);

  const unconfirmedManager = await probes.manager("bypass-unconfirmed");
  const unconfirmed = await appCall(
    await probes.sessionCookie(unconfirmedManager),
    "POST",
    `/admin/users/${staffTarget.id}/ban`,
    timed,
  );
  check("a timed ban of staff asks for a step-up", unconfirmed.status === 403, unconfirmed.status);

  const permanent = await probes.user("bypass-permanent");
  await db
    .update(authSchema.user)
    .set({ banned: true, banExpires: null })
    .where(eq(authSchema.user.id, permanent.id));
  const replaced = await appCall(
    requester.cookie,
    "POST",
    `/admin/users/${permanent.id}/ban`,
    timed,
  );
  check("a timed ban over a permanent one waits", replaced.status === 202, replaced.body);
  const [still] = await db
    .select({ banExpires: authSchema.user.banExpires })
    .from(authSchema.user)
    .where(eq(authSchema.user.id, permanent.id));
  check("the permanent ban stands meanwhile", still?.banExpires === null);

  const plain = await probes.user("bypass-plain");
  const open = await appCall(requester.cookie, "POST", `/admin/users/${plain.id}/ban`, timed);
  check("a timed ban of a plain user stays direct", open.status === 200, open.body);
}

async function proveImpossibleRequestsAreNotQueued(): Promise<void> {
  const support = await moderator("queue-support");
  const staffTarget = await probes.manager("queue-staff");
  const fromSupport = await appCall(support.cookie, "POST", `/admin/users/${staffTarget.id}/ban`, {
    reason: "probe",
  });
  check(
    "support cannot queue a ban of a manager",
    codeOf(fromSupport) === "ADMIN_USER_STAFF_TARGET_FORBIDDEN",
    fromSupport.body,
  );

  const requester = await manager("queue-requester");
  const plain = await probes.user("queue-plain");
  const notStaff = await appCall(requester.cookie, "DELETE", `/admin/staff/${plain.id}`);
  check(
    "a revocation of a non staff is refused at once",
    codeOf(notStaff) === "ADMIN_STAFF_NOT_FOUND",
    notStaff.body,
  );

  const self = await appCall(requester.cookie, "DELETE", `/admin/staff/${requester.probe.id}`);
  check(
    "a self revocation keeps its own code",
    codeOf(self) === "ADMIN_STAFF_SELF_CHANGE_FORBIDDEN",
    self.body,
  );

  const listedId = requester.probe.id;
  const colleague = await manager("queue-colleague");
  const previous = env.PLATFORM_ADMIN_IDS;
  Object.assign(env, { PLATFORM_ADMIN_IDS: [listedId] });
  const onListed = await appCall(colleague.cookie, "DELETE", `/admin/staff/${listedId}`);
  Object.assign(env, { PLATFORM_ADMIN_IDS: previous });
  check(
    "a listed id cannot be queued for revocation",
    codeOf(onListed) === "ADMIN_STAFF_LISTED_FORBIDDEN",
    onListed.body,
  );

  const rows = await db
    .select({ id: adminApproval.id })
    .from(adminApproval)
    .where(inArray(adminApproval.subjectId, [staffTarget.id, plain.id, listedId]));
  check("none of them stored a request", rows.length === 0, rows);
}

async function proveOnePendingPerPair(): Promise<void> {
  const requesters = await Promise.all(
    Array.from({ length: RACERS }, (_, n) => manager(`pair-requester-${n}`)),
  );
  const target = await probes.user("pair-target");

  const asked = await Promise.all(
    requesters.map(({ cookie }) =>
      appCall(cookie, "POST", `/admin/users/${target.id}/ban`, {
        reason: "check-admin-approval probe",
      }),
    ),
  );
  const opened = asked.filter((answer) => answer.status === 202);
  const refused = asked.filter((answer) => answer.status === 409);
  check(
    "one racing request opens the row",
    opened.length === 1,
    asked.map((a) => a.status),
  );
  check("the others are told someone else asked", refused.length === RACERS - 1);
  const id = opened[0]?.body.approvalId ?? "";
  check(
    "each refusal names the open request",
    refused.every(
      (answer) =>
        codeOf(answer) === "ADMIN_APPROVAL_ALREADY_PENDING_CONFLICT" &&
        answer.body.error?.metadata?.approvalId === id,
    ),
    refused[0]?.body,
  );
  const rows = await db.select().from(adminApproval).where(eq(adminApproval.subjectId, target.id));
  check("one row is stored", rows.length === 1, rows.length);
  check(
    "one request is announced",
    (await eventsOf(EventTypes.ADMIN_APPROVAL_REQUESTED, target.id, id)).length === 1,
  );

  const atDatabase = await db
    .insert(adminApproval)
    .values({
      id: crypto.randomUUID(),
      action: "user.ban_permanent",
      subjectId: target.id,
      params: {},
      requestedBy: requesters[0]?.probe.id ?? "",
      expiresAt: new Date(Date.now() + 60_000),
    })
    .then(
      () => "written",
      (err: { cause?: { constraint?: string } }) => err.cause?.constraint,
    );
  check(
    "the database refuses a second one",
    atDatabase === "admin_approval_one_pending_uq",
    atDatabase,
  );

  await db
    .update(adminApproval)
    .set({ expiresAt: new Date(Date.now() - 60_000) })
    .where(eq(adminApproval.id, id));
  const fresh = requesters[0] ? await requestBan(requesters[0], target.id) : "";
  check("an overdue request does not block a new one", fresh !== id);
  check("the overdue one is closed", (await rowOf(id)).status === "expired");
  check(
    "its expiry is announced",
    (await eventsOf(EventTypes.ADMIN_APPROVAL_EXPIRED, target.id, id)).length === 1,
  );
}

async function proveStaleRequesterClosesTheRow(): Promise<void> {
  const requester = await manager("stale-requester");
  const approver = await manager("stale-approver");
  const target = await probes.user("stale-target");
  const id = await requestBan(requester, target.id);
  await db
    .update(staffMember)
    .set({ revokedAt: new Date() })
    .where(eq(staffMember.userId, requester.probe.id));

  const refused = await decide(approver, id);
  check(
    "a revoked requester's request dies",
    codeOf(refused) === "ADMIN_APPROVAL_REQUESTER_LOST_CONFLICT",
    refused.body,
  );
  const row = await rowOf(id);
  check(
    "the row closes as failed with that reason",
    row.status === "failed" && row.failureReason === "ADMIN_APPROVAL_REQUESTER_LOST_CONFLICT",
    row,
  );
  check("the stale request ran nothing", (await banOf(target.id)) === false);
}

async function proveUnderpoweredDeciderKeepsTheRow(): Promise<void> {
  const requester = await manager("power-requester");
  const approver = await moderatorApprover("power-approver");
  const target = await probes.user("power-target");
  const id = await requestBan(requester, target.id);
  await db.insert(staffMember).values({ userId: target.id, role: "support", source: "console" });

  const refused = await decide(approver, id);
  check(
    "a decider without power over the target is refused",
    codeOf(refused) === "ADMIN_USER_STAFF_TARGET_FORBIDDEN",
    refused.body,
  );
  check("the row stays pending", (await rowOf(id)).status === "pending");
  const winner = await manager("power-winner");
  check("a colleague with the power can still decide", (await decide(winner, id)).status === 200);
}

async function proveDeletedUserKeepsTheAudit(): Promise<void> {
  const requester = await manager("gone-requester");
  const approver = await manager("gone-approver");
  const settled = await probes.user("gone-settled");
  const open = await probes.user("gone-open");
  const decided = await requestBan(requester, settled.id);
  await decide(approver, decided, "reject");
  const pending = await requestBan(requester, open.id);

  const close = di.CloseApprovalsOfDeletedUser;
  await close.handle({
    eventId: crypto.randomUUID(),
    eventType: EventTypes.USER_DELETED,
    aggregateId: open.id,
    dateOccurred: new Date(),
    payload: { userId: open.id, deletedAt: new Date() },
  });
  const row = await rowOf(pending);
  check("a deleted subject's open request is cancelled", row.status === "cancelled", row.status);
  check("its free text is erased", JSON.stringify(row.params) === "{}", row.params);
  check(
    "the cancellation is announced with no actor",
    JSON.stringify(await eventsOf(EventTypes.ADMIN_APPROVAL_CANCELLED, open.id, pending)).includes(
      '"actorUserId":null',
    ),
  );

  await db.delete(authSchema.user).where(eq(authSchema.user.id, settled.id));
  await db.delete(authSchema.user).where(eq(authSchema.user.id, approver.probe.id));
  const kept = await rowOf(decided);
  check("a removed user row leaves the history", kept.subjectId === settled.id);
  check("the decider's id stays on it", kept.decidedBy === approver.probe.id);
}

async function proveListKeyset(): Promise<void> {
  const requester = await manager("page-requester");
  const targets = await Promise.all([probes.user("page-a"), probes.user("page-b")]);
  const ids = await Promise.all(targets.map((target) => requestBan(requester, target.id)));
  const sameInstant = new Date();
  await db
    .update(adminApproval)
    .set({ createdAt: sameInstant })
    .where(inArray(adminApproval.id, ids));

  const seen: string[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < 2; page++) {
    const query: string = cursor ? `&cursor=${encodeURIComponent(cursor)}` : "";
    const answer = await appCall(requester.cookie, "GET", `/admin/approvals?limit=1${query}`);
    const { items = [], nextCursor = null } = answer.body;
    seen.push(...items.map((item) => item.id));
    cursor = nextCursor;
  }
  check(
    "two requests of the same instant are each listed once",
    ids.every((id) => seen.filter((other) => other === id).length === 1),
    seen,
  );
}

async function requestOverride(requester: Staff, targetId: string, body: object): Promise<AppCall> {
  return appCall(requester.cookie, "POST", `/admin/staff/${targetId}/overrides`, body);
}

async function proveOverrideThroughDecide(): Promise<void> {
  const requester = await manager("override-requester");
  const otherRequester = await manager("override-other");
  const approver = await manager("override-approver");
  const lacking = await probes.manager("override-lacking");
  await grant(lacking.id, "billing.override", "deny");
  const lackingApprover = await confirm(lacking);
  const target = await probes.manager("override-target");
  const body = { permission: "billing.override", effect: "grant", expiresAt: null };

  const asked = await requestOverride(requester, target.id, body);
  const id = asked.body.approvalId ?? "";
  check("an override opens a request", asked.status === 202 && id !== "", asked.body);

  const repeated = await requestOverride(requester, target.id, { ...body });
  check("the same request repeated is the same id", repeated.body.approvalId === id, repeated.body);

  const different = await requestOverride(requester, target.id, { ...body, effect: "deny" });
  check(
    "a different override on one person is refused, not dropped",
    different.status === 409 &&
      codeOf(different) === "ADMIN_APPROVAL_ALREADY_PENDING_CONFLICT" &&
      different.body.error?.metadata?.approvalId === id,
    different.body,
  );
  const someoneElse = await requestOverride(otherRequester, target.id, body);
  check(
    "someone else asking the same is refused with the open id",
    someoneElse.status === 409 && someoneElse.body.error?.metadata?.approvalId === id,
    someoneElse.body,
  );

  const unheld = await decide(lackingApprover, id);
  check(
    "a decider who lacks the permission cannot grant it",
    codeOf(unheld) === "ADMIN_STAFF_GRANT_NOT_HELD_FORBIDDEN",
    unheld.body,
  );
  check("that refusal keeps the request open", (await rowOf(id)).status === "pending");

  const approved = await decide(approver, id);
  check("the approver grants through decide", approved.status === 200, approved.body);
  const live = await di.IStaffStore.listLiveOverrides(target.id);
  const [written] = live.isSuccess ? live.getValue() : [];
  check("the grant is written", written?.effect === "grant", written);

  const overrideId = written?.id ?? "";
  const revoking = await appCall(
    requester.cookie,
    "DELETE",
    `/admin/staff/${target.id}/overrides/${overrideId}`,
  );
  const revokeId = revoking.body.approvalId ?? "";
  check("a removal opens a request", revoking.status === 202, revoking.body);
  const stored = await rowOf(revokeId);
  const params = stored.params as Record<string, unknown>;
  check(
    "the request names what it removes, not a bare id",
    params.overrideId === overrideId &&
      params.permission === "billing.override" &&
      params.effect === "grant" &&
      params.expiresAt === null,
    params,
  );
  const removed = await decide(approver, revokeId);
  check("the approver removes through decide", removed.status === 200, removed.body);
  const after = await di.IStaffStore.listLiveOverrides(target.id);
  check("the override is no longer live", after.isSuccess && after.getValue().length === 0);

  const timed = await requestOverride(requester, target.id, {
    ...body,
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
  });
  const timedId = timed.body.approvalId ?? "";
  await db
    .update(adminApproval)
    .set({
      params: {
        op: "set",
        permission: "billing.override",
        effect: "grant",
        expiresAt: new Date(Date.now() - 60_000).toISOString(),
      },
    })
    .where(eq(adminApproval.id, timedId));
  await decide(approver, timedId);
  const lapsed = await rowOf(timedId);
  check(
    "an end date passed while waiting gives its own reason",
    lapsed.status === "failed" && lapsed.failureReason === "ADMIN_STAFF_OVERRIDE_EXPIRED_CONFLICT",
    lapsed.failureReason,
  );
}

async function pagedIds(
  list: (cursor?: string) => Promise<{ ids: string[]; next: string | null }>,
): Promise<string[]> {
  const seen: string[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 10; page++) {
    const { ids, next } = await list(cursor);
    seen.push(...ids);
    if (!next) return seen;

    cursor = next;
  }

  return seen;
}

async function proveExactCursors(): Promise<void> {
  const instants = [
    "2031-01-01 00:00:00.123456",
    "2031-01-01 00:00:00.123456",
    "2031-01-01 00:00:00.123100",
  ];
  const tag = crypto.randomUUID();
  const users = await Promise.all(instants.map((_, n) => probes.user(`cursor-${n}`)));
  const userIds = users.map((user) => user.id);
  const orgIds = instants.map((_, n) => `org-${tag}-${n}`);
  const auditIds = instants.map((_, n) => `audit-${tag}-${n}`);
  const { organization } = multiTenantSchema;
  const { auditLog } = auditLogSchema;
  await db
    .insert(organization)
    .values(orgIds.map((id) => ({ id, name: id, slug: id, createdAt: new Date() })));
  await db.insert(auditLog).values(
    auditIds.map((id) => ({
      id,
      actorType: "system" as const,
      action: "check.cursor",
      targetType: "probe",
      targetId: tag,
      metadata: {},
      retention: "operational" as const,
    })),
  );
  for (const [n, at] of instants.entries()) {
    await db.execute(sql`UPDATE "user" SET created_at = ${at}::timestamp WHERE id = ${userIds[n]}`);
    await db.execute(
      sql`UPDATE organization SET created_at = ${at}::timestamp WHERE id = ${orgIds[n]}`,
    );
    await db.execute(
      sql`UPDATE audit_log SET occurred_at = ${at}::timestamp WHERE id = ${auditIds[n]}`,
    );
  }

  const parsedCursor = (raw?: string) => (raw ? timeIdCursorSchema.parse(raw) : undefined);
  const seenUsers = await pagedIds(async (cursor) => {
    const page = await di.AdminQueryService.listUsers({
      limit: 1,
      search: "cursor-",
      cursor: parsedCursor(cursor),
    });
    const { items, nextCursor } = page.getValue();

    return { ids: items.map((row) => row.id), next: nextCursor.toNull() };
  });
  check(
    "users of one microsecond and one millisecond are each listed once",
    userIds.every((id) => seenUsers.filter((other) => other === id).length === 1),
    seenUsers,
  );
  const seenOrgs = await pagedIds(async (cursor) => {
    const page = await di.AdminQueryService.listOrgs({
      limit: 1,
      search: tag,
      cursor: parsedCursor(cursor),
    });
    const { items, nextCursor } = page.getValue();

    return { ids: items.map((row) => row.id), next: nextCursor.toNull() };
  });
  check(
    "organizations of one microsecond and one millisecond are each listed once",
    orgIds.every((id) => seenOrgs.filter((other) => other === id).length === 1),
    seenOrgs,
  );
  const seenAudit = await pagedIds(async (cursor) => {
    const page = await di.AuditQueryService.listForPlatform({ limit: 1, targetId: tag, cursor });
    const { items, nextCursor } = page.getValue();

    return { ids: items.map((row) => row.id), next: nextCursor.toNull() };
  });
  check(
    "audit rows of one microsecond and one millisecond are each listed once",
    auditIds.every((id) => seenAudit.filter((other) => other === id).length === 1),
    seenAudit,
  );

  await db.delete(organization).where(inArray(organization.id, orgIds));
  await db.delete(auditLog).where(inArray(auditLog.id, auditIds));
}

async function proveLiveBanStatus(): Promise<void> {
  const lapsed = await probes.user("ban-lapsed");
  const running = await probes.user("ban-running");
  const forever = await probes.user("ban-forever");
  const clean = await probes.user("ban-none");
  const { user } = authSchema;
  await db
    .update(user)
    .set({ banned: true, banReason: "old", banExpires: new Date(Date.now() - 60_000) })
    .where(eq(user.id, lapsed.id));
  await db
    .update(user)
    .set({ banned: true, banReason: "now", banExpires: new Date(Date.now() + 60_000) })
    .where(eq(user.id, running.id));
  await db.update(user).set({ banned: true }).where(eq(user.id, forever.id));

  const listed = async (banned: boolean) => {
    const page = await di.AdminQueryService.listUsers({ limit: 100, search: "-ban-", banned });

    return page.getValue().items;
  };
  const suspended = (await listed(true)).map((row) => row.id);
  const active = (await listed(false)).map((row) => row.id);
  check(
    "the suspended filter keeps live bans only",
    suspended.includes(running.id) &&
      suspended.includes(forever.id) &&
      !suspended.includes(lapsed.id),
    suspended,
  );
  check(
    "the active filter holds a lapsed ban and nobody banned",
    active.includes(lapsed.id) && active.includes(clean.id) && !active.includes(running.id),
    active,
  );
  const row = (await listed(false)).find((candidate) => candidate.id === lapsed.id);
  check(
    "a lapsed ban reads as no ban at all",
    row?.banned === false && row.banReason.isNone() && row.banExpires.isNone(),
    row,
  );
}

async function proveSweepGuards(): Promise<void> {
  const settings = await di.ITransactionService.run(async () => {
    await di.IApprovalStore.expireDue(1);
    const exec = resolveExecutor();
    const expiry = await exec.execute(sql`SELECT current_setting('lock_timeout') AS value`);
    await di.IApprovalStore.countDue();
    const counted = await exec.execute(sql`SELECT current_setting('statement_timeout') AS value`);

    return Result.ok({ expiry: expiry.rows[0], counted: counted.rows[0] });
  });
  const value = settings.getValue();
  check("the expiry runs under the lock guard", value.expiry?.value === "500ms", value.expiry);
  check("the count runs under its timeout", value.counted?.value === "10s", value.counted);
}

async function proveRecipientParity(): Promise<void> {
  const permission = "approvals.decide";
  const now = new Date();
  const past = new Date(now.getTime() - 60_000);
  const fixtures = await Promise.all(
    ["role", "no-role", "grant", "deny", "expired", "revoked", "env", "listed", "listed-env"].map(
      (name) => probes.user(`parity-${name}`),
    ),
  );
  const named = (name: string) => {
    const found = fixtures.find((fixture) => fixture.id.endsWith(`parity-${name}`));
    if (!found) throw new Error(`no fixture ${name}`);

    return found.id;
  };
  const row = (name: string, role: "manager" | "auditor", source: "console" | "env") => ({
    userId: named(name),
    role,
    source,
  });
  await db
    .insert(staffMember)
    .values([
      row("role", "manager", "console"),
      row("no-role", "auditor", "console"),
      row("grant", "auditor", "console"),
      row("deny", "manager", "console"),
      row("expired", "auditor", "console"),
      { ...row("revoked", "manager", "console"), revokedAt: past },
      row("env", "manager", "env"),
      row("listed-env", "manager", "env"),
    ]);
  await grant(named("grant"), permission, "grant");
  await grant(named("deny"), permission, "deny");
  await db.insert(staffPermissionOverride).values({
    id: crypto.randomUUID(),
    userId: named("expired"),
    permission,
    effect: "grant",
    expiresAt: past,
  });
  await db
    .update(authSchema.user)
    .set({ twoFactorEnabled: true })
    .where(inArray(authSchema.user.id, [named("role"), named("listed")]));

  const ids = fixtures.map((fixture) => fixture.id);
  for (const requireMfa of [false, true]) {
    const staffEnv = {
      PLATFORM_ADMIN_IDS: [named("listed"), named("listed-env")],
      PLATFORM_ADMIN_REQUIRE_MFA: requireMfa,
    };
    const recipients = staffRecipients(
      {
        kind: "staff",
        permission,
        requesterUserId: Option.none(),
        actorUserId: Option.none(),
        subjectUserId: Option.none(),
      },
      staffEnv,
    );
    const answered = await db.execute(sql`SELECT user_id FROM ${recipients} AS r`);
    const fromSql = answered.rows
      .map((rowOfSql) => String(rowOfSql.user_id))
      .filter((id) => ids.includes(id))
      .sort();

    const decided: string[] = [];
    for (const id of ids) {
      const [user] = await db
        .select({ twoFactorEnabled: authSchema.user.twoFactorEnabled })
        .from(authSchema.user)
        .where(eq(authSchema.user.id, id));
      const found = await di.IStaffStore.findActive(id);
      const access = staffAccessOf({ id, ...user }, found.getValue(), staffEnv).toNull();
      if (authorizeStaff(access, permission)) decided.push(id);
    }

    check(
      `the audience matches staffAccessOf with MFA ${requireMfa ? "required" : "optional"}`,
      JSON.stringify(fromSql) === JSON.stringify(decided.sort()),
      { fromSql, decided },
    );
  }
}

async function proveParamsRevalidated(): Promise<void> {
  const requester = await manager("params-requester");
  const approver = await manager("params-approver");
  const target = await probes.user("params-target");
  const id = await requestBan(requester, target.id);
  await db
    .update(adminApproval)
    .set({ params: { reason: "" } })
    .where(eq(adminApproval.id, id));

  const refused = await decide(approver, id);
  check(
    "tampered params fail the route's validation",
    codeOf(refused) === "ADMIN_APPROVAL_PARAMS_INVALID",
    refused.body,
  );
  check("tampered params run nothing", (await banOf(target.id)) === false);
  check("tampered params mark it failed", (await rowOf(id)).status === "failed");
}

async function provePermissionLost(): Promise<void> {
  const requester = await manager("lost-requester");
  const target = await probes.user("lost-target");
  const id = await requestBan(requester, target.id);

  const denied = await manager("lost-denied");
  await grant(denied.probe.id, "users.moderate", "deny");
  const refused = await decide(denied, id);
  check(
    "an approver who lost the action's permission is refused",
    codeOf(refused) === "ADMIN_APPROVAL_PERMISSION_FORBIDDEN",
    refused.body,
  );

  const demoted = await manager("lost-demoted");
  await db
    .update(staffMember)
    .set({ role: "auditor" })
    .where(eq(staffMember.userId, demoted.probe.id));
  const gone = await decide(demoted, id);
  check(
    "an approver who lost approvals.decide is refused",
    codeOf(gone) === "ADMIN_STAFF_PERMISSION_FORBIDDEN",
    gone.body,
  );

  const row = await rowOf(id);
  check("a refused approver leaves the row pending", row.status === "pending", row.status);
  check("a refused approver runs nothing", (await banOf(target.id)) === false);
}

async function proveRejectCancelAndRoleChange(): Promise<void> {
  const requester = await manager("settle-requester");
  const approver = await manager("settle-approver");
  const target = await probes.user("settle-target");

  const rejected = await requestBan(requester, target.id);
  check("a rejection answers 200", (await decide(approver, rejected, "reject")).status === 200);
  check("a rejection runs nothing", (await banOf(target.id)) === false);
  check("the row is rejected", (await rowOf(rejected)).status === "rejected");

  const cancelled = await requestBan(requester, target.id);
  const colleague = await appCall(approver.cookie, "POST", `/admin/approvals/${cancelled}/cancel`);
  check(
    "a colleague cannot withdraw a request",
    codeOf(colleague) === "ADMIN_APPROVAL_NOT_FOUND",
    colleague.body,
  );
  const own = await appCall(requester.cookie, "POST", `/admin/approvals/${cancelled}/cancel`);
  check("the requester withdraws their own", own.status === 200, own.body);
  check(
    "a withdrawn request cannot be decided",
    codeOf(await decide(approver, cancelled)) === "ADMIN_APPROVAL_DECIDED_CONFLICT",
  );
  check("a withdrawal runs nothing", (await banOf(target.id)) === false);

  const asked = await appCall(requester.cookie, "PUT", `/admin/staff/${target.id}/role`, {
    role: "support",
  });
  check("a role change answers 202", asked.status === 202, asked.body);
  const id = asked.body.approvalId ?? "";
  check("the role change waits", (await staffRole(target.id)) === undefined);
  check("the approved role change answers 200", (await decide(approver, id)).status === 200);
  check("the role change runs on approval", (await staffRole(target.id)) === "support");
  const payloads = await probes.eventPayloads(EventTypes.ADMIN_STAFF_ADDED, target.id);
  check(
    "the action's own event names the approver",
    JSON.stringify(payloads[0]).includes(`"actorUserId":"${approver.probe.id}"`),
    payloads,
  );

  const listed = await appCall(approver.cookie, "GET", `/admin/approvals/${id}`);
  check("an approver reads the detail", listed.status === 200, listed.body);
  const plain = await appCall(
    (await moderatorApprover("settle-plain")).cookie,
    "GET",
    "/admin/approvals?status=executed&limit=1",
  );
  check("an approver lists", plain.status === 200, plain.body);
}

async function staffRole(userId: string): Promise<string | undefined> {
  const [row] = await db
    .select({ role: staffMember.role })
    .from(staffMember)
    .where(eq(staffMember.userId, userId));

  return row?.role;
}

async function hasNotification(userId: string, type: string): Promise<boolean> {
  const n = notificationSchema.notification;
  const rows = await db
    .select({ id: n.id })
    .from(n)
    .where(and(eq(n.userId, userId), eq(n.eventType, type)));

  return rows.length > 0;
}

async function proveWhoIsNotified(): Promise<void> {
  const requester = await manager("notice-requester");
  const approver = await manager("notice-approver");
  const denied = await manager("notice-denied");
  await grant(denied.probe.id, "approvals.decide", "deny");
  const auditor = await manager("notice-auditor");
  await db
    .update(staffMember)
    .set({ role: "auditor" })
    .where(eq(staffMember.userId, auditor.probe.id));
  const granted = await moderatorApprover("notice-granted");
  const target = await probes.user("notice-target");
  const id = await requestBan(requester, target.id);

  const event = (eventType: string, actorUserId: string | null) => ({
    eventId: crypto.randomUUID(),
    eventType,
    aggregateId: id,
    aggregateType: "admin_approval",
    payload: {
      approvalId: id,
      action: "user.ban_permanent",
      requesterUserId: requester.probe.id,
      userId: target.id,
      actorUserId,
    },
    dateOccurred: new Date(),
  });

  const requested = EventTypes.ADMIN_APPROVAL_REQUESTED;
  await di.NotificationFanoutSubscriber.handle(event(requested, requester.probe.id));
  check("an approver is told", await hasNotification(approver.probe.id, requested));
  check("an override grant is told", await hasNotification(granted.probe.id, requested));
  check("an override deny is not", !(await hasNotification(denied.probe.id, requested)));
  check("an auditor is not", !(await hasNotification(auditor.probe.id, requested)));
  check(
    "the requester is not told of their own act",
    !(await hasNotification(requester.probe.id, requested)),
  );
  check("the subject is not told", !(await hasNotification(target.id, requested)));

  const executed = EventTypes.ADMIN_APPROVAL_EXECUTED;
  await di.NotificationFanoutSubscriber.handle(event(executed, approver.probe.id));
  check("the requester learns the outcome", await hasNotification(requester.probe.id, executed));
  check(
    "the approver is not told of their own act",
    !(await hasNotification(approver.probe.id, executed)),
  );

  const expired = EventTypes.ADMIN_APPROVAL_EXPIRED;
  await di.NotificationFanoutSubscriber.handle(event(expired, null));
  check("with no actor, the requester is told", await hasNotification(requester.probe.id, expired));
  check("with no actor, approvers are told", await hasNotification(approver.probe.id, expired));
}

async function main(): Promise<void> {
  Object.assign(env, { ADMIN_APPROVAL_ENABLED: true, ADMIN_APPROVAL_ACTIONS: APPROVAL_ACTIONS });

  await proveOffChangesNothing();
  await proveSelfApprovalRefused();
  await proveOneWinner();
  await proveExpiry();
  await proveFailureRollsBackThenMarks();
  await proveParamsRevalidated();
  await provePermissionLost();
  await proveRejectCancelAndRoleChange();
  await proveWhoIsNotified();
  await proveSubjectStaysOut();
  await proveBanGateCoversEveryBypass();
  await proveImpossibleRequestsAreNotQueued();
  await proveOnePendingPerPair();
  await proveStaleRequesterClosesTheRow();
  await proveUnderpoweredDeciderKeepsTheRow();
  await proveDeletedUserKeepsTheAudit();
  await proveListKeyset();
  await proveOverrideThroughDecide();
  await proveExactCursors();
  await proveLiveBanStatus();
  await proveSweepGuards();
  await proveRecipientParity();
  await probes.cleanup();

  if (checks.failures > 0) {
    console.error(`\n${checks.failures} check(s) failed`);
    process.exit(1);
  }
  console.log("\nAll assertions passed, four-eyes approvals hold on the real stack.");
  process.exit(0);
}

main().catch(async (err) => {
  console.error("check-admin-approval crashed:", err);
  await probes.cleanup().catch(() => {});
  process.exit(1);
});
