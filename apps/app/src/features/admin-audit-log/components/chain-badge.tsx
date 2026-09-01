import { Badge } from "@packages/ui/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { chainVerifyQueryOptions } from "../api/audit-log.queries";

export function ChainBadge() {
  const { t } = useTranslation("admin");
  const { data, isLoading } = useQuery(chainVerifyQueryOptions);

  if (isLoading || !data) {
    return <Badge variant="secondary">{t("auditLog.chain.checking")}</Badge>;
  }

  if (data.verified) {
    return <Badge variant="secondary">{t("auditLog.chain.verified")}</Badge>;
  }

  return (
    <Badge variant="destructive">
      {t("auditLog.chain.broken", { sequence: data.brokenAtSequence ?? "—" })}
    </Badge>
  );
}
