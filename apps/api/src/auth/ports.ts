import type { StaffStoreError } from "@modules/admin/ports/staff-store";
import type { ConsentError } from "@modules/consents/ports/consent";
import type {
  PolicyAcceptanceRecord,
  PolicyError,
} from "@modules/policies/ports/policy-acceptance";
import type { Option, Result } from "@packages/ddd-kit";
import type Stripe from "stripe";
import type { GeoDeniedError, VisitorGeo } from "../shared/ports/ip-geo.port";

type PolicyType = PolicyAcceptanceRecord["policyType"];

export interface ISecuritySignals {
  refuseDenied(attempt: {
    visitor: VisitorGeo;
    ip: string | null;
    path: string;
    actorUserId: string | null;
  }): Promise<Result<void, GeoDeniedError>>;
  sessionFields(visitor: VisitorGeo): { country?: string };
  reportImpossibleTravel(signIn: {
    userId: string;
    sessionId: string;
    ip: string | null;
    visitor: VisitorGeo;
  }): Promise<void>;
}

export interface IPlanCatalog {
  getCatalog(): Promise<readonly { tier: string; priceId: string | null }[]>;
}

export interface IStripeSyncCheck {
  check(event: Stripe.Event): Promise<Option<string>>;
}

export interface IPolicyAcceptance {
  getStaleTypes(userId: string): Promise<Result<PolicyType[], PolicyError>>;
  accept(
    userId: string,
    types: PolicyType[],
    ipAddress?: string,
  ): Promise<Result<void, PolicyError>>;
}

export interface IConsentReconciler {
  reconcile(subjectId: string, userId: string): Promise<Result<void, ConsentError>>;
}

export interface EndingSession {
  id: string;
  userId: string;
  expiresAt: Date;
}

export interface IStaffSessionEnder {
  endSession(session: EndingSession, endpointPath?: string): Promise<Result<void, StaffStoreError>>;
}
