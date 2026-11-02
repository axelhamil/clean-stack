import { apiErrorFields } from "@packages/web-kit/api/errors/api-error";
import { z } from "zod";

const awaitingSchema = z.object({ approvalId: z.string() });

export async function approvalIdOf(res: {
  status: number;
  json: () => Promise<unknown>;
}): Promise<string | null> {
  if (res.status !== 202) return null;

  return awaitingSchema.parse(await res.json()).approvalId;
}

const PENDING_CONFLICT = "ADMIN_APPROVAL_ALREADY_PENDING_CONFLICT";

export function openApprovalIdOf(error: unknown): string | null {
  const { code, metadata } = apiErrorFields(error);
  if (code !== PENDING_CONFLICT) return null;

  const parsed = awaitingSchema.safeParse(metadata);

  return parsed.success ? parsed.data.approvalId : null;
}

export function isApprovalGone(error: unknown): boolean {
  const { code } = apiErrorFields(error);

  return code?.endsWith("_CONFLICT") === true || code?.endsWith("_NOT_FOUND") === true;
}
