import type { StaffPermission } from "@packages/access-control";
import type { BanParams } from "../../approved-action";
import type { IStepUpGate } from "../../ports/services/step-up-gate.port";

export interface BanUserInput {
  actorUserId: string;
  actorPermissions: readonly StaffPermission[];
  userId: string;
  ban: BanParams;
  stepUp: IStepUpGate;
}
