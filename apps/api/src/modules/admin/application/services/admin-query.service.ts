import { Option, Result } from "@packages/ddd-kit";
import type { IInstrumentation } from "../../../../shared/ports/instrumentation.port";
import type { ListOrgsInput } from "../dto/list-orgs.dto";
import type { ListUsersInput } from "../dto/list-users.dto";
import type { AdminOrgMemberRow, AdminOrgRow, IAdminOrgStore } from "../ports/admin-org-store.port";
import type {
  AdminMembershipRow,
  AdminSessionRow,
  AdminStoreError,
  AdminUserRow,
  IAdminUserStore,
} from "../ports/admin-user-store.port";

export type AdminQueryError = AdminStoreError;

export type AdminOrgDetail = AdminOrgRow & {
  members: AdminOrgMemberRow[];
  plan: Option<string>;
};

export type AdminUserDetail = AdminUserRow & {
  sessions: AdminSessionRow[];
  memberships: AdminMembershipRow[];
};

export interface AdminPage<T> {
  items: T[];
  nextCursor: Option<string>;
}

function toPage<T extends { createdAt: Date }>(items: T[], limit: number): AdminPage<T> {
  const last = items.at(-1);
  const isFull = items.length === limit && last !== undefined;
  const nextCursor = isFull ? Option.some(last.createdAt.toISOString()) : Option.none<string>();

  return { items, nextCursor };
}

export class AdminQueryService {
  constructor(
    private readonly store: IAdminUserStore,
    private readonly instrumentation: IInstrumentation,
    private readonly orgStore: IAdminOrgStore,
  ) {}

  async listUsers(
    input: ListUsersInput,
  ): Promise<Result<AdminPage<AdminUserRow>, AdminQueryError>> {
    return this.instrumentation.startSpan({ name: "AdminQueryService > listUsers" }, async () => {
      const rows = await this.store.listUsers(input);
      if (rows.isFailure) return Result.fail(rows.getError());

      return Result.ok(toPage(rows.getValue(), input.limit));
    });
  }

  async listOrgs(input: ListOrgsInput): Promise<Result<AdminPage<AdminOrgRow>, AdminQueryError>> {
    return this.instrumentation.startSpan({ name: "AdminQueryService > listOrgs" }, async () => {
      const rows = await this.orgStore.listOrgs(input);
      if (rows.isFailure) return Result.fail(rows.getError());

      return Result.ok(toPage(rows.getValue(), input.limit));
    });
  }

  async getOrg(id: string): Promise<Result<Option<AdminOrgDetail>, AdminQueryError>> {
    return this.instrumentation.startSpan({ name: "AdminQueryService > getOrg" }, async () => {
      const found = await this.orgStore.findOrgById(id);
      if (found.isFailure) return Result.fail(found.getError());

      const maybeOrg = found.getValue();
      if (maybeOrg.isNone()) return Result.ok(Option.none<AdminOrgDetail>());

      const [members, plan] = await Promise.all([
        this.orgStore.listMembersOf(id),
        this.orgStore.findPlanFor(id),
      ]);
      if (members.isFailure) return Result.fail(members.getError());
      if (plan.isFailure) return Result.fail(plan.getError());

      return Result.ok(
        Option.some({ ...maybeOrg.unwrap(), members: members.getValue(), plan: plan.getValue() }),
      );
    });
  }

  async getUser(id: string): Promise<Result<Option<AdminUserDetail>, AdminQueryError>> {
    return this.instrumentation.startSpan({ name: "AdminQueryService > getUser" }, async () => {
      const found = await this.store.findUserById(id);
      if (found.isFailure) return Result.fail(found.getError());

      const maybeUser = found.getValue();
      if (maybeUser.isNone()) return Result.ok(Option.none<AdminUserDetail>());

      const [sessions, memberships] = await Promise.all([
        this.store.listSessionsFor(id),
        this.store.listMembershipsFor(id),
      ]);
      if (sessions.isFailure) return Result.fail(sessions.getError());
      if (memberships.isFailure) return Result.fail(memberships.getError());

      return Result.ok(
        Option.some({
          ...maybeUser.unwrap(),
          sessions: sessions.getValue(),
          memberships: memberships.getValue(),
        }),
      );
    });
  }
}
