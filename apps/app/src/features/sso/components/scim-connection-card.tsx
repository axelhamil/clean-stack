import { Button } from "@packages/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@packages/ui/components/ui/card";
import { TypographyMuted } from "@packages/ui/components/ui/typography";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { activeOrgQueryOptions } from "../../../shared/api/queries/active-org";
import { useAuthorization } from "../../../shared/auth/use-authorization";
import { SecretRevealDialog } from "../../../shared/components/secret-reveal-dialog";
import { env } from "../../../shared/env";
import { generateScimTokenMutationOptions } from "../api/sso.mutations";
import { primaryProviderFor, ssoProvidersQueryOptions } from "../api/sso.queries";
import { CopyRow } from "./copy-row";

const SCIM_BASE_URL = `${env.VITE_API_URL}/api/auth/scim/v2`;

export function ScimConnectionCard() {
  const { t } = useTranslation("settings");
  const { data: org } = useQuery(activeOrgQueryOptions);
  const { data: providers } = useQuery(ssoProvidersQueryOptions);
  const { role } = useAuthorization();
  const [revealToken, setRevealToken] = useState<string | null>(null);

  const provider = primaryProviderFor(providers, org?.id);
  // The `scim` plugin is configured with `requiredRole: ["owner"]` in apps/api/src/auth.ts
  // — showing this to an admin would only ever end in a 403.
  const canGenerate = role === "owner";

  const generate = useMutation({
    ...generateScimTokenMutationOptions,
    onSuccess: (token) => setRevealToken(token),
    onError: (err) => toast.error(err.message),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("sso.scimCard.title")}</CardTitle>
        <CardDescription>{t("sso.scimCard.description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {!provider ? (
          <TypographyMuted>{t("sso.registerProviderFirst")}</TypographyMuted>
        ) : !canGenerate ? (
          <TypographyMuted>{t("sso.scimCard.onlyOwnerCanGenerate")}</TypographyMuted>
        ) : (
          <>
            <CopyRow label={t("sso.scimCard.baseUrlLabel")} value={SCIM_BASE_URL} />
            <Button
              className="w-fit"
              disabled={generate.isPending}
              onClick={() =>
                org && generate.mutate({ providerId: provider.providerId, organizationId: org.id })
              }
            >
              {t("sso.scimCard.generateAction")}
            </Button>
          </>
        )}
      </CardContent>

      <SecretRevealDialog
        secret={revealToken}
        onClose={() => setRevealToken(null)}
        title={t("sso.scimCard.secretDialogTitle")}
        description={t("sso.scimCard.secretDialogDescription")}
      />
    </Card>
  );
}
