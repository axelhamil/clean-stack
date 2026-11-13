import type { IQuery, Option } from "@packages/ddd-kit";
import type {
  AdminStoreError,
  AdminUserListRow,
  ListUsersQuery,
} from "../ports/repositories/admin-user-store.port";
import type { EntitlementsReadError } from "../ports/services/entitlements-reader.port";

export type AdminQueryError = AdminStoreError | EntitlementsReadError;

export interface AdminPage<T> {
  items: T[];
  nextCursor: Option<string>;
}

export type IListUsersQuery = IQuery<ListUsersQuery, AdminPage<AdminUserListRow>, AdminQueryError>;
