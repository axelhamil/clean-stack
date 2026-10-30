import type { EventHandler } from "@packages/ddd-kit";
import { defineModule } from "inwire";
import { env } from "../../shared/env";
import type { IStaffStore } from "../../shared/ports/staff-store.port";
import { StaffAccessService } from "../../shared/services/staff-access.service";
import { notifyImpersonatedUser } from "./application/event-handlers/notify-impersonated-user";
import type { IAdminOrgStore } from "./application/ports/admin-org-store.port";
import type { IAdminUserStore } from "./application/ports/admin-user-store.port";
import { AdminQueryService } from "./application/services/admin-query.service";
import { StaffService } from "./application/services/staff.service";
import { DrizzleAdminOrgStore } from "./infrastructure/repositories/drizzle-admin-org.store";
import { DrizzleAdminUserStore } from "./infrastructure/repositories/drizzle-admin-user.store";
import { DrizzleStaffStore } from "./infrastructure/repositories/drizzle-staff.store";

declare module "inwire" {
  interface AppDeps {
    IAdminUserStore: IAdminUserStore;
    IAdminOrgStore: IAdminOrgStore;
    AdminQueryService: AdminQueryService;
    IStaffStore: IStaffStore;
    StaffAccessService: StaffAccessService;
    StaffService: StaffService;
    NotifyImpersonatedUser: EventHandler;
  }
}

export const adminModule = defineModule()((b) =>
  b
    .add("IAdminUserStore", (c): IAdminUserStore => new DrizzleAdminUserStore(c.IInstrumentation))
    .add("IAdminOrgStore", (c): IAdminOrgStore => new DrizzleAdminOrgStore(c.IInstrumentation))
    .add(
      "AdminQueryService",
      (c) => new AdminQueryService(c.IAdminUserStore, c.IInstrumentation, c.IAdminOrgStore),
    )
    .add("IStaffStore", (c): IStaffStore => new DrizzleStaffStore(c.IInstrumentation))
    .add(
      "StaffAccessService",
      (c) => new StaffAccessService(c.IStaffStore, c.IOutboxRepository, c.ITransactionService, env),
    )
    .add(
      "StaffService",
      (c) =>
        new StaffService(
          c.IStaffStore,
          c.IAdminUserStore,
          c.IOutboxRepository,
          c.ITransactionService,
          env,
        ),
    )
    .add("NotifyImpersonatedUser", (c) =>
      notifyImpersonatedUser({
        IEmailService: c.IEmailService,
        AdminQueryService: c.AdminQueryService,
        IProfileStore: c.IProfileStore,
        supportUrl: `${env.APP_URL}/support`,
      }),
    ),
);
