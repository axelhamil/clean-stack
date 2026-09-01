import { useQuery } from "@tanstack/react-query";
import { useId } from "react";
import { useTranslation } from "react-i18next";
import { sessionQueryOptions } from "../api/queries/session";
import { isImpersonating } from "./is-impersonating";

export interface ImpersonationGuard {
  blocked: boolean;
  reason: string | undefined;
  descriptionId: string;
}

export function impersonationGuard(session: Parameters<typeof isImpersonating>[0]): {
  blocked: boolean;
} {
  return { blocked: isImpersonating(session) };
}

/**
 * A disabled control is skipped by Tab, so `title` alone never reaches a
 * keyboard/screen-reader user — it is mouse-only. `descriptionId` names a
 * DOM element (rendered by `ImpersonationReason` below) that callers wire in
 * via `aria-describedby`, which screen readers do read in browse mode even
 * though the control itself is unreachable by Tab. One id per guard call —
 * every control on the same page shares it, per the "one element, several
 * aria-describedby" rule: duplicating the text node per control is worse,
 * not more correct.
 */
export function useImpersonationGuard(): ImpersonationGuard {
  const { t } = useTranslation("common");
  const { data: session } = useQuery(sessionQueryOptions);
  const { blocked } = impersonationGuard(session);
  const descriptionId = useId();
  return {
    blocked,
    reason: blocked ? t("impersonation.actionUnavailable") : undefined,
    descriptionId,
  };
}
