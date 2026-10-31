import { Option, Result } from "@packages/ddd-kit";
import { encodeTimeIdCursor } from "../../../../shared/pagination/time-id-cursor";
import type { IEntitlementsReader } from "../../../../shared/ports/entitlements-reader.port";
import type { IInstrumentation } from "../../../../shared/ports/instrumentation.port";
import type {
  ActivePlanOverride,
  IPlanOverrideStore,
  PlanOverrideStoreError,
} from "../../../../shared/ports/plan-override.port";
import type { ListOrgsInput } from "../dto/list-orgs.dto";
import type { ListUsersInput } from "../dto/list-users.dto";
import type {
  AdminOrgListRow,
  AdminOrgMemberRow,
  AdminOrgRow,
  IAdminOrgStore,
} from "../ports/admin-org-store.port";
import type {
  AdminMembershipRow,
  AdminSessionRow,
  AdminStoreError,
  AdminUserListRow,
  AdminUserRow,
  IAdminUserStore,
} from "../ports/admin-user-store.port";

export type AdminQueryError = AdminStoreError | PlanOverrideStoreError;

export type AdminOrgDetail = AdminOrgRow & {
  members: AdminOrgMemberRow[];
  plan: string;
  planOverride: Option<ActivePlanOverride>;
};

export type AdminUserDetail = AdminUserRow & {
  sessions: AdminSessionRow[];
  memberships: AdminMembershipRow[];
};

export interface AdminPage<T> {
  items: T[];
  nextCursor: Option<string>;
}

function toPage<T extends { cursorAt: string; id: string }>(
  items: T[],
  limit: number,
): AdminPage<T> {
  const last = items.at(-1);
  const isFull = items.length === limit && last !== undefined;
  const nextCursor = isFull
    ? Option.some(encodeTimeIdCursor(last.cursorAt, last.id))
    : Option.none<string>();

  return { items, nextCursor };
}

export class AdminQueryService {
  constructor(
    private readonly store: IAdminUserStore,
    private readonly instrumentation: IInstrumentation,
    private readonly orgStore: IAdminOrgStore,
    private readonly entitlements: IEntitlementsReader,
    private readonly planOverrides: IPlanOverrideStore,
  ) {}

  async listUsers(
    input: ListUsersInput,
  ): Promise<Result<AdminPage<AdminUserListRow>, AdminQueryError>> {
    return this.instrumentation.startSpan({ name: "AdminQueryService > listUsers" }, async () => {
      const rows = await this.store.listUsers(input);
      if (rows.isFailure) return Result.fail(rows.getError());

      return Result.ok(toPage(rows.getValue(), input.limit));
    });
  }

  async listOrgs(
    input: ListOrgsInput,
  ): Promise<Result<AdminPage<AdminOrgListRow>, AdminQueryError>> {
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

      const [members, view, planOverride] = await Promise.all([
        this.orgStore.listMembersOf(id),
        this.entitlements.getEntitlements(id),
        this.planOverrides.findActive(id),
      ]);
      if (members.isFailure) return Result.fail(members.getError());
      if (planOverride.isFailure) return Result.fail(planOverride.getError());

      return Result.ok(
        Option.some({
          ...maybeOrg.unwrap(),
          members: members.getValue(),
          plan: view.tier,
          planOverride: planOverride.getValue(),
        }),
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
