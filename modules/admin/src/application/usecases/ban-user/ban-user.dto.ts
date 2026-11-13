import type { StaffPermission } from "@packages/access-control";
import type { BanParams } from "../../approved-action";

export interface BanUserInput {
  actorUserId: string;
  actorPermissions: readonly StaffPermission[];
  userId: string;
  ban: BanParams;
  confirmStepUp: () => Promise<void>;
}
