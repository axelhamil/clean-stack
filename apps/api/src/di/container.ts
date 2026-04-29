import { container } from "inwire";
import { ResendEmailService } from "../adapters/services/email.service";
import type { IEmailService } from "../application/ports/email.port";

export interface AppDeps {
  IEmailService: IEmailService;
}

export const di = container<AppDeps>()
  .add("IEmailService", () => new ResendEmailService())
  .build();
