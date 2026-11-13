import type { IQuery, Option } from "@packages/ddd-kit";
import type { AdminOrgMemberRow, AdminOrgRow } from "../ports/repositories/admin-org-store.port";
import type { ActivePlanOverride } from "../ports/repositories/plan-override.port";
import type { AdminQueryError } from "./list-users.query";

export type AdminOrgDetail = AdminOrgRow & {
  members: AdminOrgMemberRow[];
  plan: string;
  planOverride: Option<ActivePlanOverride>;
};

export type IGetOrgQuery = IQuery<
  { organizationId: string },
  Option<AdminOrgDetail>,
  AdminQueryError
>;
