import type { ILocaleReader } from "@modules/admin/ports/locale-reader";
import type { StripeReplayRule } from "@modules/admin/ports/stripe-event";
import type { StaffLookupOnce } from "@modules/admin/services/staff-access";
import { isReplayableStripeEvent } from "@modules/billing/ports/stripe-event";
import type { IProfileStore } from "@modules/profile/ports/profile";
import { defineModule } from "inwire";
import { localeForUser } from "../../shared/locale-for-user";
import { staffLookupOnce } from "../../shared/request-context";

export interface AdminSourcesPrerequisites {
  IProfileStore: IProfileStore;
}

export const adminSources = defineModule<AdminSourcesPrerequisites>()((b) =>
  b
    .add(
      "ILocaleReader",
      (c): ILocaleReader => ({ localeOf: (userId) => localeForUser(c.IProfileStore, userId) }),
    )
    .add("isReplayableStripeEvent", (): StripeReplayRule => isReplayableStripeEvent)
    .add("staffLookupOnce", (): StaffLookupOnce => staffLookupOnce),
);
