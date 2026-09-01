import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { sessionQueryOptions } from "../api/queries/session";
import { isImpersonating } from "./is-impersonating";

export interface ImpersonationGuard {
  blocked: boolean;
  reason: string | undefined;
}

export function impersonationGuard(session: Parameters<typeof isImpersonating>[0]): {
  blocked: boolean;
} {
  return { blocked: isImpersonating(session) };
}

export function useImpersonationGuard(): ImpersonationGuard {
  const { t } = useTranslation("common");
  const { data: session } = useQuery(sessionQueryOptions);
  const { blocked } = impersonationGuard(session);
  return { blocked, reason: blocked ? t("impersonation.actionUnavailable") : undefined };
}
