import { type ApprovalAction, STAFF_ROLES, type StaffPermission } from "@packages/access-control";
import { type AppError, Result } from "@packages/ddd-kit";
import { z } from "zod";
import { banUserBodySchema } from "./dto/ban-user.dto";
import { setStaffRoleBodySchema } from "./dto/set-staff-role.dto";
import { setStaffOverrideBodySchema } from "./dto/staff-override.dto";
import type { ApprovalRecord } from "./ports/approval-store.port";

const storedRoleChangeSchema = setStaffRoleBodySchema.extend({
  fromRole: z.enum(STAFF_ROLES).nullable(),
});

const emptyParamsSchema = z.object({});

const overrideChangeSchema = z.discriminatedUnion("op", [
  setStaffOverrideBodySchema.extend({ op: z.literal("set") }),
  z.object({ op: z.literal("revoke"), overrideId: z.string().min(1) }),
]);

interface RequestParams {
  "user.ban_permanent": z.infer<typeof banUserBodySchema>;
  "staff.role_change": z.infer<typeof setStaffRoleBodySchema>;
  "staff.revoke": z.infer<typeof emptyParamsSchema>;
  "staff.permission_override": z.infer<typeof overrideChangeSchema>;
}

interface StoredParams {
  "user.ban_permanent": z.infer<typeof banUserBodySchema>;
  "staff.role_change": z.infer<typeof storedRoleChangeSchema>;
  "staff.revoke": z.infer<typeof emptyParamsSchema>;
  "staff.permission_override": z.infer<typeof overrideChangeSchema>;
}

export type ApprovedActionOf<K extends ApprovalAction> = {
  [A in K]: { action: A; subjectId: string; params: StoredParams[A] };
}[K];

export type ApprovedAction = ApprovedActionOf<ApprovalAction>;

export type RequestedAction<K extends ApprovalAction> = {
  [A in K]: { action: A; subjectId: string; params: RequestParams[A] };
}[K];

export interface ApprovalActor {
  userId: string;
  permissions: readonly StaffPermission[];
}

export interface ApprovalHandler<K extends ApprovalAction> {
  prepare(
    request: { subjectId: string; params: RequestParams[K] },
    actor: ApprovalActor,
  ): Promise<Result<StoredParams[K], AppError>>;
  authorize(subjectId: string, actor: ApprovalActor): Promise<Result<void, AppError>>;
  run(approved: ApprovedActionOf<K>, actor: ApprovalActor): Promise<Result<void, AppError>>;
}

export type ApprovalHandlers = { [K in ApprovalAction]: ApprovalHandler<K> };

const invalidParams: AppError<"ADMIN_APPROVAL_PARAMS_INVALID"> = {
  code: "ADMIN_APPROVAL_PARAMS_INVALID",
  message: "The stored request no longer passes validation.",
};

export function readApprovedAction(
  record: Pick<ApprovalRecord, "action" | "subjectId" | "params">,
): Result<ApprovedAction, AppError<"ADMIN_APPROVAL_PARAMS_INVALID">> {
  const { subjectId, params } = record;

  switch (record.action) {
    case "user.ban_permanent": {
      const parsed = banUserBodySchema.safeParse(params);
      if (!parsed.success) return Result.fail(invalidParams);

      return Result.ok({ action: record.action, subjectId, params: parsed.data });
    }
    case "staff.role_change": {
      const parsed = storedRoleChangeSchema.safeParse(params);
      if (!parsed.success) return Result.fail(invalidParams);

      return Result.ok({ action: record.action, subjectId, params: parsed.data });
    }
    case "staff.revoke":
      return Result.ok({ action: record.action, subjectId, params: {} });
    case "staff.permission_override": {
      const parsed = overrideChangeSchema.safeParse(params);
      if (!parsed.success) return Result.fail(invalidParams);

      return Result.ok({ action: record.action, subjectId, params: parsed.data });
    }
  }
}
