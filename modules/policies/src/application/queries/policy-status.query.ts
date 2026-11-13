import type { IQuery } from "@packages/ddd-kit";
import type { PolicyError } from "../ports/repositories/policy-acceptance.port";
import type { PolicyStatus } from "../services/policy-status.service";

export interface PolicyStatusInput {
  userId: string;
}

export type IPolicyStatusQuery = IQuery<PolicyStatusInput, PolicyStatus, PolicyError>;
