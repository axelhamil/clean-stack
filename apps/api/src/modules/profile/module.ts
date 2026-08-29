import { defineModule } from "inwire";
import type { IProfileStore } from "../../shared/ports/profile.port";
import { DrizzleProfileStore } from "./infrastructure/repositories/drizzle-profile.store";

declare module "inwire" {
  interface AppDeps {
    IProfileStore: IProfileStore;
  }
}

export const profileModule = defineModule()((b) =>
  b.add("IProfileStore", (c): IProfileStore => new DrizzleProfileStore(c.IInstrumentation)),
);
