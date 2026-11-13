import type { Result } from "@packages/ddd-kit";
import type {
  EntitlementsReadError,
  IEntitlementsReader,
} from "../ports/services/entitlements-reader.port";
import type { IGetEntitlementsQuery } from "../queries/get-entitlements.query";
import type { IReadEntitlementsQuery } from "../queries/read-entitlements.query";
import type { EntitlementsView } from "./entitlement-policy.service";

export class EntitlementsService implements IEntitlementsReader {
  constructor(
    private readonly getEntitlementsQuery: IGetEntitlementsQuery,
    private readonly readEntitlementsQuery: IReadEntitlementsQuery,
  ) {}

  async getEntitlements(organizationId: string): Promise<EntitlementsView> {
    const view = await this.getEntitlementsQuery.execute({ organizationId });

    return view.getValue();
  }

  readEntitlements(
    organizationId: string,
  ): Promise<Result<EntitlementsView, EntitlementsReadError>> {
    return this.readEntitlementsQuery.execute({ organizationId });
  }
}
