import { Badge } from "@packages/ui/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@packages/ui/components/ui/card";
import { TypographyMuted } from "@packages/ui/components/ui/typography";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { policiesQueryOptions } from "../../../shared/api/queries/policies";

const POLICY_KEYS = {
  privacy: "privacy.policyAcceptance.policies.privacy",
  terms: "privacy.policyAcceptance.policies.terms",
} as const;

type PolicyType = keyof typeof POLICY_KEYS;
type PolicyKey = (typeof POLICY_KEYS)[PolicyType];

function isPolicyType(value: string): value is PolicyType {
  return value in POLICY_KEYS;
}

// The API returns the policy type as a bare string, so an unknown type has to
// render as itself rather than as a missing key: the register can gain a policy
// before the catalog does, and a raw slug is a better fallback than a blank row.
export function policyLabelFor(type: string, translate: (key: PolicyKey) => string): string {
  return isPolicyType(type) ? translate(POLICY_KEYS[type]) : type;
}

export function PolicyAcceptanceCard() {
  const { data, isLoading } = useQuery(policiesQueryOptions);
  const { t } = useTranslation("settings");

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("privacy.policyAcceptance.title")}</CardTitle>
        <CardDescription>{t("privacy.policyAcceptance.description")}</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <TypographyMuted>{t("privacy.policyAcceptance.loading")}</TypographyMuted>
        ) : data ? (
          <ul className="flex flex-col divide-y">
            {Object.entries(data).map(([type, status]) => (
              <li key={type} className="flex items-center justify-between gap-4 py-3">
                <span className="text-sm font-medium">{policyLabelFor(type, t)}</span>
                <div className="flex items-center gap-3">
                  <TypographyMuted className="text-xs">
                    {status.acceptedVersion
                      ? `v${status.acceptedVersion}`
                      : t("privacy.policyAcceptance.neverAccepted")}
                  </TypographyMuted>
                  {status.current ? (
                    <Badge variant="secondary">{t("privacy.policyAcceptance.upToDate")}</Badge>
                  ) : (
                    <Badge variant="destructive">
                      {t("privacy.policyAcceptance.updateRequired")}
                    </Badge>
                  )}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <TypographyMuted>{t("privacy.policyAcceptance.loadError")}</TypographyMuted>
        )}
      </CardContent>
    </Card>
  );
}
