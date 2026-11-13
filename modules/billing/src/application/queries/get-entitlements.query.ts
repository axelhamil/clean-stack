import type { IQuery } from "@packages/ddd-kit";
import type { EntitlementsView } from "../services/entitlement-policy.service";

export interface EntitlementsInput {
  organizationId: string;
}

export type IGetEntitlementsQuery = IQuery<EntitlementsInput, EntitlementsView, never>;
