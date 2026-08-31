import { Badge } from "@packages/ui/components/ui/badge";
import { Button } from "@packages/ui/components/ui/button";
import { TableCell, TableRow } from "@packages/ui/components/ui/table";
import { useTranslation } from "react-i18next";
import { useFormatDate } from "../../../shared/i18n/use-format-date";
import type { ApiToken } from "../api/api-tokens.queries";

interface TokenRowProps {
  token: ApiToken;
  onRevoke: (id: string) => void;
  isRevoking: boolean;
}

export function TokenRow({ token, onRevoke, isRevoking }: TokenRowProps) {
  const { t } = useTranslation("settings");
  const formatDate = useFormatDate();
  const isRevoked = token.revokedAt !== null;
  const isExpired =
    !isRevoked && token.expiresAt !== null && new Date(token.expiresAt) < new Date();

  return (
    <TableRow>
      <TableCell className="font-medium">{token.name}</TableCell>
      <TableCell className="font-mono text-sm">{token.tokenStart}…</TableCell>
      <TableCell>
        <div className="flex flex-wrap gap-1">
          {token.scopes.map((scope) => (
            <Badge key={scope} variant="secondary">
              {scope}
            </Badge>
          ))}
        </div>
      </TableCell>
      <TableCell>{token.lastUsedAt ? formatDate(token.lastUsedAt) : "—"}</TableCell>
      <TableCell>
        {token.expiresAt ? formatDate(token.expiresAt) : t("apiTokens.neverExpires")}
      </TableCell>
      <TableCell>
        {isRevoked && <Badge variant="destructive">{t("apiTokens.statusRevoked")}</Badge>}
        {isExpired && <Badge variant="outline">{t("apiTokens.statusExpired")}</Badge>}
      </TableCell>
      <TableCell>
        {!isRevoked && (
          <Button
            variant="ghost"
            size="sm"
            disabled={isRevoking}
            onClick={() => onRevoke(token.id)}
          >
            {t("apiTokens.revokeAction")}
          </Button>
        )}
      </TableCell>
    </TableRow>
  );
}
