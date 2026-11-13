import type { IInstrumentation, IUnitOfWork } from "@packages/ddd-kit";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import { defineModule } from "inwire";
import type {
  IProfileRepository,
  IProfileStore,
} from "./application/ports/repositories/profile.port";
import type { IUserNameWriter } from "./application/ports/services/user-name-writer.port";
import type { IGetLocaleQuery } from "./application/queries/get-locale.query";
import type { IGetLocaleByEmailQuery } from "./application/queries/get-locale-by-email.query";
import { ProfileStoreService } from "./application/services/profile-store.service";
import { SetLocaleUseCase } from "./application/usecases/set-locale/set-locale.usecase";
import { UpdateDisplayNameUseCase } from "./application/usecases/update-display-name/update-display-name.usecase";
import { DrizzleGetLocaleQuery } from "./infra/queries/get-locale.query";
import { DrizzleGetLocaleByEmailQuery } from "./infra/queries/get-locale-by-email.query";
import { DrizzleProfileRepository } from "./infra/repos/drizzle/profile.repository";

export interface ProfilePrerequisites {
  IInstrumentation: IInstrumentation;
  ITransactionService: IUnitOfWork;
  IOutboxRepository: IOutboxRepository;
  IUserAccountStore: IUserNameWriter;
}

export const profileModule = defineModule<ProfilePrerequisites>()((b) =>
  b
    .add(
      "IProfileRepository",
      (c): IProfileRepository => new DrizzleProfileRepository(c.IInstrumentation),
    )
    .add("IGetLocaleQuery", (c): IGetLocaleQuery => new DrizzleGetLocaleQuery(c.IInstrumentation))
    .add(
      "IGetLocaleByEmailQuery",
      (c): IGetLocaleByEmailQuery => new DrizzleGetLocaleByEmailQuery(c.IInstrumentation),
    )
    .add(
      "SetLocaleUseCase",
      (c) =>
        new SetLocaleUseCase(
          c.IGetLocaleQuery,
          c.IProfileRepository,
          c.ITransactionService,
          c.IOutboxRepository,
        ),
    )
    .add(
      "UpdateDisplayNameUseCase",
      (c) =>
        new UpdateDisplayNameUseCase(
          c.IUserAccountStore,
          c.ITransactionService,
          c.IOutboxRepository,
        ),
    )
    .add(
      "IProfileStore",
      (c): IProfileStore =>
        new ProfileStoreService(c.IGetLocaleQuery, c.IGetLocaleByEmailQuery, c.IProfileRepository),
    ),
);
