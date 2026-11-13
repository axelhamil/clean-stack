import type { IQuery } from "@packages/ddd-kit";
import type { AdminOrgListRow, ListOrgsQuery } from "../ports/repositories/admin-org-store.port";
import type { AdminPage, AdminQueryError } from "./list-users.query";

export type IListOrgsQuery = IQuery<ListOrgsQuery, AdminPage<AdminOrgListRow>, AdminQueryError>;
