import { Badge } from "@packages/ui/components/ui/badge";
import { Hint } from "@packages/ui/components/ui/hint";
import { useTranslation } from "react-i18next";

export interface ChainBadgeProps {
  verification: { verified: boolean; brokenAtSequence?: number | null } | undefined;
  failed?: boolean;
}

export function ChainBadge({ verification: data, failed = false }: ChainBadgeProps) {
  const { t } = useTranslation("admin");

  if (failed) return <Badge variant="destructive">{t("auditLog.chain.failed")}</Badge>;

  if (!data) {
    return <Badge variant="secondary">{t("auditLog.chain.checking")}</Badge>;
  }

  if (data.verified) {
    return (
      <Hint text={t("auditLog.chain.verifiedHint")}>
        <Badge variant="secondary">{t("auditLog.chain.verified")}</Badge>
      </Hint>
    );
  }

  return (
    <Hint text={t("auditLog.chain.brokenHint")}>
      <Badge variant="destructive">
        {t("auditLog.chain.broken", { sequence: data.brokenAtSequence ?? "?" })}
      </Badge>
    </Hint>
  );
}
