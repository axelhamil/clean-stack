import {
  type ApprovalAction,
  STAFF_PERMISSIONS,
  STAFF_ROLES,
  type StaffPermission,
} from "@packages/access-control";
import { type AppError, Result } from "@packages/ddd-kit";
import { z } from "zod";
import type { ApprovalRecord } from "./ports/repositories/approval-store.port";

const MAX_TIMED_BAN_SECONDS = 90 * 24 * 60 * 60;

export const banUserBodySchema = z.object({
  reason: z.string().trim().min(1).max(500),
  expiresIn: z.number().int().positive().max(MAX_TIMED_BAN_SECONDS).optional(),
});

export const setStaffRoleBodySchema = z.object({ role: z.enum(STAFF_ROLES) });

export const setStaffOverrideBodySchema = z.object({
  permission: z.enum(STAFF_PERMISSIONS),
  effect: z.enum(["grant", "deny"]),
  expiresAt: z.iso
    .datetime()
    .refine((value) => new Date(value).getTime() > Date.now())
    .nullable(),
});

const storedRoleChangeSchema = setStaffRoleBodySchema.extend({
  fromRole: z.enum(STAFF_ROLES).nullable(),
});

const emptyParamsSchema = z.object({});

const requestedOverrideSchema = z.discriminatedUnion("op", [
  setStaffOverrideBodySchema.extend({ op: z.literal("set") }),
  z.object({ op: z.literal("revoke"), overrideId: z.string().min(1) }),
]);

const overrideFields = {
  permission: z.enum(STAFF_PERMISSIONS),
  effect: z.enum(["grant", "deny"]),
  expiresAt: z.iso.datetime().nullable(),
};

const storedOverrideSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("set"), ...overrideFields }),
  z.object({ op: z.literal("revoke"), overrideId: z.string().min(1), ...overrideFields }),
]);

interface RequestParams {
  "user.ban_permanent": z.infer<typeof banUserBodySchema>;
  "staff.role_change": z.infer<typeof setStaffRoleBodySchema>;
  "staff.revoke": z.infer<typeof emptyParamsSchema>;
  "staff.permission_override": z.infer<typeof requestedOverrideSchema>;
}

interface StoredParams {
  "user.ban_permanent": z.infer<typeof banUserBodySchema>;
  "staff.role_change": z.infer<typeof storedRoleChangeSchema>;
  "staff.revoke": z.infer<typeof emptyParamsSchema>;
  "staff.permission_override": z.infer<typeof storedOverrideSchema>;
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
  authorize(approved: ApprovedActionOf<K>, actor: ApprovalActor): Promise<Result<void, AppError>>;
  run(approved: ApprovedActionOf<K>, actor: ApprovalActor): Promise<Result<void, AppError>>;
}

export type ApprovalHandlers = { [K in ApprovalAction]: ApprovalHandler<K> };

const invalidParams: AppError<"ADMIN_APPROVAL_PARAMS_INVALID"> = {
  code: "ADMIN_APPROVAL_PARAMS_INVALID",
  message: "The stored request no longer passes validation.",
};

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (typeof value !== "object" || value === null) return value;

  return Object.entries(value)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, item]) => [key, canonical(item)]);
}

export function sameApprovalParams(a: unknown, b: unknown): boolean {
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
}

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
      const parsed = storedOverrideSchema.safeParse(params);
      if (!parsed.success) return Result.fail(invalidParams);

      return Result.ok({ action: record.action, subjectId, params: parsed.data });
    }
  }
}
