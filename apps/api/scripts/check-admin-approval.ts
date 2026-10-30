/**
 * Proves against a real Postgres and the real route stack what mocks cannot: the self-approval
 * CHECK, one winner among racing decisions, the expiry predicate and sweep, a refused action
 * rolled back then recorded by a second unit, stored params revalidated, a permission lost before
 * the decision, and who the notification reaches. Creates and removes its own probe users.
 */

import { createOTP } from "@better-auth/utils/otp";
import { and, authSchema, db, eq, notificationSchema, staffSchema } from "@packages/drizzle";
import { EventTypes } from "@packages/events";
import { Hono } from "hono";
import { di } from "../src/container";
import { adminInternalRoutes } from "../src/modules/admin/internal.routes";
import { TOTP_OPTIONS } from "../src/shared/auth/totp-options";
import { env } from "../src/shared/env";
import { type AdminProbe, type AppCall, adminProbes, appCall, codeOf } from "./admin-probes";
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
  const counter = Math.floor(Date.now() / 1000 / (TOTP_OPTIONS.period ?? 30));
  const code = await createOTP(probe.totpSecret, TOTP_OPTIONS).hotp(counter);
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
  const approver = await moderatorApprover("failure-approver");
  const target = await probes.user("failure-target");
  const id = await requestBan(requester, target.id);
  await db.insert(staffMember).values({ userId: target.id, role: "support", source: "console" });

  const refused = await decide(approver, id);
  check(
    "the staff target guard runs at execution",
    codeOf(refused) === "ADMIN_USER_STAFF_TARGET_FORBIDDEN",
    refused.body,
  );
  check("the action left nothing", (await banOf(target.id)) === false);
  check(
    "the rolled back decision left no event",
    (await eventsOf(EventTypes.ADMIN_APPROVAL_DECIDED, target.id, id)).length === 0,
  );

  const row = await rowOf(id);
  check("a second unit marks it failed", row.status === "failed", row.status);
  check(
    "the reason is stored",
    row.failureReason === "ADMIN_USER_STAFF_TARGET_FORBIDDEN",
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
  Object.assign(env, { ADMIN_APPROVAL_ENABLED: true });

  await proveOffChangesNothing();
  await proveSelfApprovalRefused();
  await proveOneWinner();
  await proveExpiry();
  await proveFailureRollsBackThenMarks();
  await proveParamsRevalidated();
  await provePermissionLost();
  await proveRejectCancelAndRoleChange();
  await proveWhoIsNotified();
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
