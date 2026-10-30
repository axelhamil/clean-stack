import { type AppError, Result } from "@packages/ddd-kit";
import type { z } from "zod";
import { banUserBodySchema } from "./dto/ban-user.dto";
import { setStaffRoleBodySchema } from "./dto/set-staff-role.dto";
import type { ApprovalRecord } from "./ports/approval-store.port";

export type ApprovedAction =
  | {
      action: "user.ban_permanent";
      subjectId: string;
      params: z.infer<typeof banUserBodySchema>;
    }
  | {
      action: "staff.role_change";
      subjectId: string;
      params: z.infer<typeof setStaffRoleBodySchema>;
    }
  | { action: "staff.revoke"; subjectId: string };

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
      const parsed = setStaffRoleBodySchema.safeParse(params);
      if (!parsed.success) return Result.fail(invalidParams);

      return Result.ok({ action: record.action, subjectId, params: parsed.data });
    }
    case "staff.revoke":
      return Result.ok({ action: record.action, subjectId });
  }
}
