import { Option, type Result } from "@packages/ddd-kit";
import type { PolicyType } from "@packages/policies";
import type { PolicyError } from "../ports/repositories/policy-acceptance.port";
import type { IPolicyStatusQuery } from "../queries/policy-status.query";
import type { AcceptPoliciesUseCase } from "../usecases/accept-policies/accept-policies.usecase";
import { staleTypesOf } from "./policy-status.service";

export class PolicyAcceptanceService {
  constructor(
    private readonly acceptPolicies: AcceptPoliciesUseCase,
    private readonly policyStatus: IPolicyStatusQuery,
  ) {}

  async accept(
    userId: string,
    types: PolicyType[],
    ipAddress?: string,
  ): Promise<Result<void, PolicyError>> {
    const accepted = await this.acceptPolicies.execute({
      userId,
      types: Option.some(types),
      ipAddress: Option.fromNullable(ipAddress),
    });

    return accepted.map(() => undefined);
  }

  async getStaleTypes(userId: string): Promise<Result<PolicyType[], PolicyError>> {
    const status = await this.policyStatus.execute({ userId });

    return status.map(staleTypesOf);
  }

  async hasAcceptedCurrent(userId: string): Promise<Result<boolean, PolicyError>> {
    const stale = await this.getStaleTypes(userId);

    return stale.map((types) => types.length === 0);
  }
}
