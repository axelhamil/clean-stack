import type { IUseCase, Result } from "@packages/ddd-kit";
import type { SetPlanOverrideInput } from "../usecases/set-plan-override/set-plan-override.dto";
import type { SetPlanOverrideError } from "../usecases/set-plan-override/set-plan-override.usecase";

export class PlanOverrideService {
  constructor(
    private readonly setOverride: IUseCase<SetPlanOverrideInput, void, SetPlanOverrideError>,
  ) {}

  set(input: SetPlanOverrideInput): Promise<Result<void, SetPlanOverrideError>> {
    return this.setOverride.execute(input);
  }
}
