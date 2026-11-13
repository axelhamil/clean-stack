import type { IEntitlementsReader } from "@modules/admin/ports/entitlements-reader";
import type { ILocaleReader } from "@modules/admin/ports/locale-reader";
import type { StripeReplayRule } from "@modules/admin/ports/stripe-event";
import type { StaffLookupOnce } from "@modules/admin/services/staff-access";
import { isReplayableStripeEvent } from "@modules/billing/ports/stripe-event";
import type { IReadEntitlementsQuery } from "@modules/billing/queries/read-entitlements";
import type { IGetLocaleQuery } from "@modules/profile/queries/get-locale";
import { defineModule } from "inwire";
import { localeForUser } from "../../shared/locale-for-user";
import { staffLookupOnce } from "../../shared/request-context";

export interface AdminSourcesPrerequisites {
  IGetLocaleQuery: IGetLocaleQuery;
  IReadEntitlementsQuery: IReadEntitlementsQuery;
}

export const adminSources = defineModule<AdminSourcesPrerequisites>()((b) =>
  b
    .add(
      "ILocaleReader",
      (c): ILocaleReader => ({ localeOf: (userId) => localeForUser(c.IGetLocaleQuery, userId) }),
    )
    .add(
      "IEntitlementsReader",
      (c): IEntitlementsReader => ({
        readEntitlements: (organizationId) => c.IReadEntitlementsQuery.execute({ organizationId }),
      }),
    )
    .add("isReplayableStripeEvent", (): StripeReplayRule => isReplayableStripeEvent)
    .add("staffLookupOnce", (): StaffLookupOnce => staffLookupOnce),
);
