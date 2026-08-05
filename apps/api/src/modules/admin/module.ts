import { defineModule } from "inwire";
import type { IAdminOrgStore } from "./application/ports/admin-org-store.port";
import type { IAdminUserStore } from "./application/ports/admin-user-store.port";
import { AdminQueryService } from "./application/services/admin-query.service";
import { DrizzleAdminOrgStore } from "./infrastructure/repositories/drizzle-admin-org.store";
import { DrizzleAdminUserStore } from "./infrastructure/repositories/drizzle-admin-user.store";

declare module "inwire" {
  interface AppDeps {
    IAdminUserStore: IAdminUserStore;
    IAdminOrgStore: IAdminOrgStore;
    AdminQueryService: AdminQueryService;
  }
}

export const adminModule = defineModule()((b) =>
  b
    .add("IAdminUserStore", (c): IAdminUserStore => new DrizzleAdminUserStore(c.IInstrumentation))
    .add("IAdminOrgStore", (c): IAdminOrgStore => new DrizzleAdminOrgStore(c.IInstrumentation))
    .add(
      "AdminQueryService",
      (c) => new AdminQueryService(c.IAdminUserStore, c.IInstrumentation, c.IAdminOrgStore),
    ),
);
