import type { IInstrumentation } from "@packages/ddd-kit";
import { defineModule } from "inwire";
import type { IAuditTrail } from "./application/ports/audit-trail.port";
import { AuditQueryService } from "./application/services/audit-query.service";

export interface AuditLogPrerequisites {
  IInstrumentation: IInstrumentation;
  IAuditTrail: IAuditTrail;
}

export const auditLogModule = defineModule<AuditLogPrerequisites>()((b) =>
  b.add("AuditQueryService", (c) => new AuditQueryService(c.IAuditTrail, c.IInstrumentation)),
);
