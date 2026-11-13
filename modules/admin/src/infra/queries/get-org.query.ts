import { type IInstrumentation, Option, Result } from "@packages/ddd-kit";
import type { IAdminOrgStore } from "../../application/ports/repositories/admin-org-store.port";
import type { IPlanOverrideReader } from "../../application/ports/repositories/plan-override.port";
import type { IEntitlementsReader } from "../../application/ports/services/entitlements-reader.port";
import type { AdminOrgDetail, IGetOrgQuery } from "../../application/queries/get-org.query";
import type { AdminQueryError } from "../../application/queries/list-users.query";

export class AdminOrgDetailQuery implements IGetOrgQuery {
  constructor(
    private readonly orgs: IAdminOrgStore,
    private readonly entitlements: IEntitlementsReader,
    private readonly planOverrides: IPlanOverrideReader,
    private readonly instrumentation: IInstrumentation,
  ) {}

  execute({
    organizationId,
  }: {
    organizationId: string;
  }): Promise<Result<Option<AdminOrgDetail>, AdminQueryError>> {
    return this.instrumentation.startSpan({ name: "AdminOrgDetailQuery > execute" }, async () => {
      const found = await this.orgs.findOrgById(organizationId);
      if (found.isFailure) return Result.fail(found.getError());

      const maybeOrg = found.getValue();
      if (maybeOrg.isNone()) return Result.ok(Option.none<AdminOrgDetail>());

      const [members, view, planOverride] = await Promise.all([
        this.orgs.listMembersOf(organizationId),
        this.entitlements.readEntitlements(organizationId),
        this.planOverrides.findActive(organizationId),
      ]);
      if (members.isFailure) return Result.fail(members.getError());
      if (view.isFailure) return Result.fail(view.getError());
      if (planOverride.isFailure) return Result.fail(planOverride.getError());

      return Result.ok(
        Option.some({
          ...maybeOrg.unwrap(),
          members: members.getValue(),
          plan: view.getValue().tier,
          planOverride: planOverride.getValue(),
        }),
      );
    });
  }
}
