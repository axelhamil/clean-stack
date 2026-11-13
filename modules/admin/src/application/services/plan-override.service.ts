import type { IUseCase, Result } from "@packages/ddd-kit";
import type { RevokePlanOverrideInput } from "../usecases/revoke-plan-override/revoke-plan-override.dto";
import type { RevokePlanOverrideError } from "../usecases/revoke-plan-override/revoke-plan-override.usecase";
import type { SetPlanOverrideInput } from "../usecases/set-plan-override/set-plan-override.dto";
import type { SetPlanOverrideError } from "../usecases/set-plan-override/set-plan-override.usecase";

export class PlanOverrideService {
  constructor(
    private readonly setOverride: IUseCase<SetPlanOverrideInput, void, SetPlanOverrideError>,
    private readonly revokeOverride: IUseCase<
      RevokePlanOverrideInput,
      void,
      RevokePlanOverrideError
    >,
  ) {}

  set(input: SetPlanOverrideInput): Promise<Result<void, SetPlanOverrideError>> {
    return this.setOverride.execute(input);
  }

  revoke(input: RevokePlanOverrideInput): Promise<Result<void, RevokePlanOverrideError>> {
    return this.revokeOverride.execute(input);
  }
}
