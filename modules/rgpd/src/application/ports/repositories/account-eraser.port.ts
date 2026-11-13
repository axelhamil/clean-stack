import type { Result } from "@packages/ddd-kit";
import type { EndedSessionRow } from "../services/ended-sessions.port";
import type { RgpdError } from "./deletion-state.port";

export interface RemovedMembership {
  memberId: string;
  organizationId: string;
}

export interface IAccountEraser {
  anonymize(userId: string): Promise<Result<boolean, RgpdError>>;
  endSessionsAndCredentials(userId: string): Promise<Result<EndedSessionRow[], RgpdError>>;
  removeMemberships(userId: string): Promise<Result<RemovedMembership[], RgpdError>>;
  deleteAbandonedOrganizations(organizationIds: string[]): Promise<Result<string[], RgpdError>>;
}
