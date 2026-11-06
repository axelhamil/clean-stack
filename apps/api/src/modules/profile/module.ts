import type { IInstrumentation } from "@packages/ddd-kit";
import { defineModule } from "inwire";
import type { IProfileStore } from "../../shared/ports/profile.port";
import { DrizzleProfileStore } from "./infrastructure/repositories/drizzle-profile.store";

export interface ProfilePrerequisites {
  IInstrumentation: IInstrumentation;
}

export const profileModule = defineModule<ProfilePrerequisites>()((b) =>
  b.add("IProfileStore", (c): IProfileStore => new DrizzleProfileStore(c.IInstrumentation)),
);
