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

export interface AdminSessionItem {
  id: string;
  createdAt: Date;
  expiresAt: Date;
  ipAddress: Option<string>;
  userAgent: Option<string>;
  impersonatedBy: Option<string>;
}

export interface AdminMembershipItem {
  organizationId: string;
  organizationName: string;
  role: string;
}

export type AdminUserDetail = AdminUserListItem & {
  sessions: AdminSessionItem[];
  memberships: AdminMembershipItem[];
};

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

  async getUser(id: string): Promise<Result<Option<AdminUserDetail>, AdminQueryError>> {
    return this.instrumentation.startSpan({ name: "AdminQueryService > getUser" }, async () => {
      try {
        const row = await this.store.findUserById(id);
        if (!row) return Result.ok(Option.none<AdminUserDetail>());

        const [sessions, memberships] = await Promise.all([
          this.store.listSessionsFor(id),
          this.store.listMembershipsFor(id),
        ]);

        return Result.ok(
          Option.some({
            id: row.id,
            email: row.email,
            name: row.name,
            role: Option.fromNullable(row.role),
            banned: row.banned === true,
            banReason: Option.fromNullable(row.banReason),
            banExpires: Option.fromNullable(row.banExpires),
            twoFactorEnabled: row.twoFactorEnabled === true,
            createdAt: row.createdAt,
            sessions: sessions.map((s) => ({
              id: s.id,
              createdAt: s.createdAt,
              expiresAt: s.expiresAt,
              ipAddress: Option.fromNullable(s.ipAddress),
              userAgent: Option.fromNullable(s.userAgent),
              impersonatedBy: Option.fromNullable(s.impersonatedBy),
            })),
            memberships,
          }),
        );
      } catch (err) {
        this.instrumentation.capture(err);
        return Result.fail({
          code: "ADMIN_QUERY_PROVIDER_FAILURE",
          message: "Failed to load user",
        });
      }
    });
  }
}
