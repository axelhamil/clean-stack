import {
  type IInstrumentation,
  type IUnitOfWork,
  type IUseCase,
  type Option,
  Result,
} from "@packages/ddd-kit";
import { emitBuiltEvent } from "@packages/outbox/event-emitter";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import { POLICY_VERSIONS, type PolicyType } from "@packages/policies";
import { policyAcceptedEvent } from "../../events/policy-accepted.event";
import type {
  IPolicyAcceptanceRepository,
  PolicyError,
} from "../../ports/repositories/policy-acceptance.port";
import type { IPolicyStatusQuery } from "../../queries/policy-status.query";
import { staleTypesOf } from "../../services/policy-status.service";
import type { AcceptPoliciesInput, AcceptPoliciesOutput } from "./accept-policies.dto";

export class AcceptPoliciesUseCase
  implements IUseCase<AcceptPoliciesInput, AcceptPoliciesOutput, PolicyError>
{
  constructor(
    private readonly repo: IPolicyAcceptanceRepository,
    private readonly policyStatus: IPolicyStatusQuery,
    private readonly outbox: IOutboxRepository,
    private readonly uow: IUnitOfWork,
    private readonly instrumentation: IInstrumentation,
  ) {}

  async execute(input: AcceptPoliciesInput): Promise<Result<AcceptPoliciesOutput, PolicyError>> {
    const types = await this.typesToAccept(input);
    if (types.isFailure) return Result.fail(types.getError());

    const accepted = types.getValue();
    const recorded = await this.record(input.userId, accepted, input.ipAddress);
    if (recorded.isFailure) return Result.fail(recorded.getError());

    return Result.ok({ accepted });
  }

  private async typesToAccept(
    input: AcceptPoliciesInput,
  ): Promise<Result<PolicyType[], PolicyError>> {
    if (input.types.isSome()) return Result.ok(input.types.unwrap());

    const status = await this.policyStatus.execute({ userId: input.userId });

    return status.map(staleTypesOf);
  }

  private async record(
    userId: string,
    types: PolicyType[],
    ipAddress: Option<string>,
  ): Promise<Result<void, PolicyError>> {
    if (types.length === 0) return Result.ok();

    try {
      return await this.uow.run(async () => {
        for (const policyType of types) {
          const policyVersion = POLICY_VERSIONS[policyType];

          const inserted = await this.repo.insert({
            id: crypto.randomUUID(),
            userId,
            policyType,
            policyVersion,
            ipAddress,
          });
          if (inserted.isFailure) return inserted;

          await emitBuiltEvent(
            this.outbox,
            policyAcceptedEvent({
              userId,
              policyType,
              policyVersion,
              ipAddress: ipAddress.toNull() ?? undefined,
            }),
          );
        }

        return Result.ok<PolicyError>();
      });
    } catch (err) {
      this.instrumentation.capture(err);
      return Result.fail({
        code: "POLICY_ACCEPTANCE_PROVIDER_FAILURE",
        message: "policy acceptance failed",
      });
    }
  }
}
