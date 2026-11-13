import type { PreferenceChoice } from "../update-preference/update-preference.dto";

export interface UpdateOrgPreferenceInput extends PreferenceChoice {
  organizationId: string;
  actorUserId: string;
  locked: boolean;
}
