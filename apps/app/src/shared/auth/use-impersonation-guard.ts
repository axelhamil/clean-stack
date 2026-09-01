import { useQuery } from "@tanstack/react-query";
import { useId } from "react";
import { useTranslation } from "react-i18next";
import { sessionQueryOptions } from "../api/queries/session";
import { isImpersonating } from "./is-impersonating";

/**
 * The accessible description of a frozen control, ready to spread onto it.
 * Both keys are always present (possibly `undefined`) so the shape a control
 * receives never depends on the branch it came from.
 */
export interface ImpersonationDescription {
  title: string | undefined;
  "aria-describedby": string | undefined;
}

export interface ImpersonationGuard {
  blocked: boolean;
  reason: string | undefined;
  descriptionId: string;
  describeProps: (otherwiseDisabled?: boolean) => ImpersonationDescription;
}

export function impersonationGuard(session: Parameters<typeof isImpersonating>[0]): {
  blocked: boolean;
} {
  return { blocked: isImpersonating(session) };
}

/**
 * Builds the description a frozen control carries, and refuses to claim the
 * freeze when something else already owns it.
 *
 * `otherwiseDisabled` is whatever ELSE holds the control shut right now — a
 * pending mutation, a cooldown, a missing prerequisite, an unmet precondition.
 * When it is true the control would be disabled with or without impersonation,
 * so naming impersonation as the cause would tell the user something false.
 * Hand-rolling this test at the call site is how four screens ended up
 * announcing an impersonation freeze over an `isPending` one.
 */
export function describeImpersonation(
  guard: { blocked: boolean; reason: string | undefined; descriptionId: string },
  otherwiseDisabled = false,
): ImpersonationDescription {
  const ours = guard.blocked && !otherwiseDisabled;
  return {
    title: ours ? guard.reason : undefined,
    "aria-describedby": ours ? guard.descriptionId : undefined,
  };
}

/**
 * A disabled control is skipped by Tab, so `title` alone never reaches a
 * keyboard/screen-reader user — it is mouse-only. `descriptionId` names a
 * DOM element (rendered by `ImpersonationReason` below) that `describeProps`
 * wires in via `aria-describedby`, which screen readers do read in browse mode
 * even though the control itself is unreachable by Tab. One id per guard call —
 * every control on the same page shares it, per the "one element, several
 * aria-describedby" rule: duplicating the text node per control is worse,
 * not more correct.
 *
 * Call sites spread `guard.describeProps(otherwiseDisabled)` onto the control
 * and never assemble `title`/`aria-describedby` themselves: the "is the freeze
 * actually ours?" test belongs to the guard, not to 24 copies of it.
 */
export function useImpersonationGuard(): ImpersonationGuard {
  const { t } = useTranslation("common");
  const { data: session } = useQuery(sessionQueryOptions);
  const { blocked } = impersonationGuard(session);
  const descriptionId = useId();
  const reason = blocked ? t("impersonation.actionUnavailable") : undefined;
  return {
    blocked,
    reason,
    descriptionId,
    describeProps: (otherwiseDisabled) =>
      describeImpersonation({ blocked, reason, descriptionId }, otherwiseDisabled),
  };
}
