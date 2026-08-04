import { type AppError, Option, Result } from "@packages/ddd-kit";
import type { IInstrumentation } from "../../../../shared/ports/instrumentation.port";
import type { ListUsersInput } from "../dto/list-users.dto";
import type { IAdminUserStore } from "../ports/admin-user-store.port";

export type AdminQueryError = AppError<"ADMIN_QUERY_PROVIDER_FAILURE">;

export interface AdminUserListItem {
  id: string;
  email: string;
  name: string;
  role: Option<string>;
  banned: boolean;
  banReason: Option<string>;
  banExpires: Option<Date>;
  twoFactorEnabled: boolean;
  createdAt: Date;
}

export interface AdminUserPage {
  items: AdminUserListItem[];
  nextCursor: Option<string>;
}

export class AdminQueryService {
  constructor(
    private readonly store: IAdminUserStore,
    private readonly instrumentation: IInstrumentation,
  ) {}

  async listUsers(input: ListUsersInput): Promise<Result<AdminUserPage, AdminQueryError>> {
    return this.instrumentation.startSpan({ name: "AdminQueryService > listUsers" }, async () => {
      try {
        const rows = await this.store.listUsers(input);
        const items = rows.map((row) => ({
          id: row.id,
          email: row.email,
          name: row.name,
          role: Option.fromNullable(row.role),
          banned: row.banned === true,
          banReason: Option.fromNullable(row.banReason),
          banExpires: Option.fromNullable(row.banExpires),
          twoFactorEnabled: row.twoFactorEnabled === true,
          createdAt: row.createdAt,
        }));
        const last = items.at(-1);
        const nextCursor =
          items.length === input.limit && last
            ? Option.some(last.createdAt.toISOString())
            : Option.none<string>();
        return Result.ok({ items, nextCursor });
      } catch (err) {
        this.instrumentation.capture(err);
        return Result.fail<AdminUserPage, AdminQueryError>({
          code: "ADMIN_QUERY_PROVIDER_FAILURE",
          message: "Failed to list users",
        });
      }
    });
  }
}
