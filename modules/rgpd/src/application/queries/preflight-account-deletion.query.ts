import type { IQuery } from "@packages/ddd-kit";
import type { RgpdError } from "../ports/repositories/deletion-state.port";

export interface SoleOwnedOrgWithMembers {
  orgId: string;
  orgName: string;
  otherMembersCount: number;
}

export interface PreflightAccountDeletionInput {
  userId: string;
}

export interface PreflightAccountDeletionOutput {
  blockingOrgs: SoleOwnedOrgWithMembers[];
}

export type IPreflightAccountDeletionQuery = IQuery<
  PreflightAccountDeletionInput,
  PreflightAccountDeletionOutput,
  RgpdError
>;
