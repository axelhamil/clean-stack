import { defineModule } from "inwire";
import { AuditQueryService } from "./application/services/audit-query.service";

declare module "inwire" {
  interface AppDeps {
    AuditQueryService: AuditQueryService;
  }
}

export const auditLogModule = defineModule()((b) =>
  b.add("AuditQueryService", (c) => new AuditQueryService(c.IAuditPort)),
);
