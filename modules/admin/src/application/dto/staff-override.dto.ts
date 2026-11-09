import { STAFF_PERMISSIONS } from "@packages/access-control";
import { z } from "zod";

export const setStaffOverrideBodySchema = z.object({
  permission: z.enum(STAFF_PERMISSIONS),
  effect: z.enum(["grant", "deny"]),
  expiresAt: z.iso
    .datetime()
    .refine((value) => new Date(value).getTime() > Date.now())
    .nullable(),
});
