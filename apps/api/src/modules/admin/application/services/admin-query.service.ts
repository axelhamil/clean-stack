import { type AppError, Option, Result } from "@packages/ddd-kit";
import type { IInstrumentation } from "../../../../shared/ports/instrumentation.port";
import type { ListOrgsInput } from "../dto/list-orgs.dto";
import type { ListUsersInput } from "../dto/list-users.dto";
import type { AdminOrgMemberRow, AdminOrgRow, IAdminOrgStore } from "../ports/admin-org-store.port";
import type { IAdminUserStore } from "../ports/admin-user-store.port";

export type AdminQueryError = AppError<"ADMIN_QUERY_PROVIDER_FAILURE">;

export interface AdminOrgListItem {
  id: string;
  name: string;
  slug: string;
  memberCount: number;
  createdAt: Date;
}

export type AdminOrgDetail = AdminOrgListItem & {
  members: AdminOrgMemberRow[];
  plan: Option<string>;
};

export interface AdminOrgPage {
  items: AdminOrgListItem[];
  nextCursor: Option<string>;
}

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
    private readonly orgStore: IAdminOrgStore,
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

  async listOrgs(input: ListOrgsInput): Promise<Result<AdminOrgPage, AdminQueryError>> {
    return this.instrumentation.startSpan({ name: "AdminQueryService > listOrgs" }, async () => {
      try {
        const rows = await this.orgStore.listOrgs(input);
        const items: AdminOrgListItem[] = rows.map((row: AdminOrgRow) => ({
          id: row.id,
          name: row.name,
          slug: row.slug,
          memberCount: row.memberCount,
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
        return Result.fail<AdminOrgPage, AdminQueryError>({
          code: "ADMIN_QUERY_PROVIDER_FAILURE",
          message: "Failed to list organizations",
        });
      }
    });
  }

  async getOrg(id: string): Promise<Result<Option<AdminOrgDetail>, AdminQueryError>> {
    return this.instrumentation.startSpan({ name: "AdminQueryService > getOrg" }, async () => {
      try {
        const maybeRow = await this.orgStore.findOrgById(id);
        if (maybeRow.isNone()) return Result.ok(Option.none<AdminOrgDetail>());
        const row = maybeRow.unwrap();

        const [members, plan] = await Promise.all([
          this.orgStore.listMembersOf(id),
          this.orgStore.findPlanFor(id),
        ]);

        return Result.ok(
          Option.some({
            id: row.id,
            name: row.name,
            slug: row.slug,
            memberCount: row.memberCount,
            createdAt: row.createdAt,
            members,
            plan,
          }),
        );
      } catch (err) {
        this.instrumentation.capture(err);
        return Result.fail({
          code: "ADMIN_QUERY_PROVIDER_FAILURE",
          message: "Failed to load organization",
        });
      }
    });
  }

  async getUser(id: string): Promise<Result<Option<AdminUserDetail>, AdminQueryError>> {
    return this.instrumentation.startSpan({ name: "AdminQueryService > getUser" }, async () => {
      try {
        const maybeRow = await this.store.findUserById(id);
        if (maybeRow.isNone()) return Result.ok(Option.none<AdminUserDetail>());
        const row = maybeRow.unwrap();

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
