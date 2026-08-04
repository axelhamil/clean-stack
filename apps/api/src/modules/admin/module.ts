import { defineModule } from "inwire";
import type { IAdminUserStore } from "./application/ports/admin-user-store.port";
import { AdminQueryService } from "./application/services/admin-query.service";
import { DrizzleAdminUserStore } from "./infrastructure/repositories/drizzle-admin-user.store";

declare module "inwire" {
  interface AppDeps {
    IAdminUserStore: IAdminUserStore;
    AdminQueryService: AdminQueryService;
  }
}

export const adminModule = defineModule()((b) =>
  b
    .add("IAdminUserStore", (c): IAdminUserStore => new DrizzleAdminUserStore(c.IInstrumentation))
    .add("AdminQueryService", (c) => new AdminQueryService(c.IAdminUserStore, c.IInstrumentation)),
);
