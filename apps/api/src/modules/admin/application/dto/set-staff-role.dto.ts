import { STAFF_ROLES } from "@packages/access-control";
import { z } from "zod";

export const setStaffRoleBodySchema = z.object({ role: z.enum(STAFF_ROLES) });
