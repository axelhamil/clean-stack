import { POLICY_TYPES } from "@packages/policies";
import { z } from "zod";

export const acceptPoliciesDto = z.object({
  types: z.array(z.enum(POLICY_TYPES)).optional(),
});
