import type { IQuery } from "@packages/ddd-kit";
import type { EntitlementsReadError } from "../ports/services/entitlements-reader.port";
import type { EntitlementsView } from "../services/entitlement-policy.service";
import type { EntitlementsInput } from "./get-entitlements.query";

export type IReadEntitlementsQuery = IQuery<
  EntitlementsInput,
  EntitlementsView,
  EntitlementsReadError
>;
