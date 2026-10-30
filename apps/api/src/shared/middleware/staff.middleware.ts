import { di } from "../../container";
import { staffGuards } from "./staff-guards";
import { stepUpGuards } from "./step-up-guards";

export const { requireStaff, requireStaffPermission } = staffGuards(() => di.StaffAccessService);

export const { requireStepUp, assertStepUp } = stepUpGuards(() => di.StepUpService);
