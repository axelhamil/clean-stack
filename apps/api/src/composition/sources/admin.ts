import type { ILocaleReader } from "@modules/admin/application/ports/locale-reader.port";
import type { StripeReplayRule } from "@modules/admin/application/ports/stripe-event.port";
import type { StaffLookupOnce } from "@modules/admin/application/services/staff-access.service";
import { isReplayableStripeEvent } from "@modules/billing/application/ports/stripe-event.port";
import type { IProfileStore } from "@modules/profile/application/ports/profile.port";
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
