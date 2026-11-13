import type { IQuery, Option } from "@packages/ddd-kit";
import type {
  AdminMembershipRow,
  AdminSessionRow,
  AdminUserRow,
} from "../ports/repositories/admin-user-store.port";
import type { AdminQueryError } from "./list-users.query";

export type AdminUserDetail = AdminUserRow & {
  sessions: AdminSessionRow[];
  memberships: AdminMembershipRow[];
};

export type IGetUserQuery = IQuery<{ userId: string }, Option<AdminUserDetail>, AdminQueryError>;
