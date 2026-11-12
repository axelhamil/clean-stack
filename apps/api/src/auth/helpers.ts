import type { AuthDeps } from "./deps";
import { createEmailFlows, createMailer, type DispatchEmail, type EmailFlows } from "./email";
import { createEmitter, type Emit, type EmitBestEffort } from "./emit";
import { createSsoEntitlements } from "./entitlements";
import { createPersonalOrg } from "./personal-org";
import { createScimEvents } from "./scim-events";
import { createSeatCap } from "./seats";
import { type AuthSnapshots, createSnapshots } from "./snapshots";
import { createVisitorGuard } from "./visitor";

export interface AuthHelpers {
  emit: Emit;
  emitBestEffort: EmitBestEffort;
  dispatchEmail: DispatchEmail;
  emailFlows: EmailFlows;
  refuseDeniedVisitor: ReturnType<typeof createVisitorGuard>["refuseDeniedVisitor"];
  assertSsoEntitlementFor: ReturnType<typeof createSsoEntitlements>["assertSsoEntitlementFor"];
  hasSsoEntitlement: ReturnType<typeof createSsoEntitlements>["hasSsoEntitlement"];
  seatCapFor: ReturnType<typeof createSeatCap>["seatCapFor"];
  ensurePersonalOrgFor: ReturnType<typeof createPersonalOrg>["ensurePersonalOrgFor"];
  emitScimUserEvents: ReturnType<typeof createScimEvents>["emitScimUserEvents"];
  snapshots: AuthSnapshots;
}

export function createAuthHelpers(deps: AuthDeps): AuthHelpers {
  const { emit, emitBestEffort } = createEmitter(deps);
  const { dispatchEmail, acceptStalePoliciesAtFirstVerification } = createMailer(deps);
  const { refuseDeniedVisitor } = createVisitorGuard(deps);
  const { assertSsoEntitlementFor, hasSsoEntitlement } = createSsoEntitlements(deps);
  const { seatCapFor } = createSeatCap(deps);
  const { ensurePersonalOrgFor } = createPersonalOrg(deps, emit);
  const snapshots = createSnapshots();
  const { emitScimUserEvents } = createScimEvents(emit, deps.queries, snapshots);
  const emailFlows = createEmailFlows(deps, {
    emit,
    dispatchEmail,
    acceptStalePoliciesAtFirstVerification,
  });

  return {
    emit,
    emitBestEffort,
    dispatchEmail,
    emailFlows,
    refuseDeniedVisitor,
    assertSsoEntitlementFor,
    hasSsoEntitlement,
    seatCapFor,
    ensurePersonalOrgFor,
    emitScimUserEvents,
    snapshots,
  };
}
