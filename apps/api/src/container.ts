import type { IUnitOfWork } from "@packages/ddd-kit";
import { TransactionService } from "@packages/drizzle";
import { container } from "inwire";
import { rgpdModule } from "./modules/rgpd/module";
import { uploadsModule } from "./modules/uploads/module";
import type { IEmailService } from "./shared/ports/email.port";
import { ResendEmailService } from "./shared/services/email.service";
import type { ITransaction } from "./shared/transaction";

declare module "inwire" {
  interface AppDeps {
    ITransactionService: IUnitOfWork<ITransaction>;
    IEmailService: IEmailService;
  }
}

export const di = container()
  .add("ITransactionService", () => new TransactionService())
  .add("IEmailService", (): IEmailService => new ResendEmailService())
  .addModule(uploadsModule)
  .addModule(rgpdModule)
  .build();
