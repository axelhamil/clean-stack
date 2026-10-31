import type { EntitlementsView } from "../entitlements";

export interface IEntitlementsReader {
  getEntitlements(organizationId: string): Promise<EntitlementsView>;
}
