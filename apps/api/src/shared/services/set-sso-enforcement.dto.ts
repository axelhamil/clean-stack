import { z } from "zod";

export const setSsoEnforcementBodySchema = z.object({
  enforced: z.boolean(),
});

export function ssoEnforcementChangeNeedsStepUp(body: { enforced: boolean }): boolean {
  return !body.enforced;
}
