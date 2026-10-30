import { di } from "../../container";
import { staffGuards } from "./staff-guards";

export const { requireStaff, requireStaffPermission } = staffGuards(() => di.StaffAccessService);
