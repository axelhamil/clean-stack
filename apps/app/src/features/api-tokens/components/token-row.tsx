import { Badge } from "@packages/ui/components/ui/badge";
import { Button } from "@packages/ui/components/ui/button";
import { TableCell, TableRow } from "@packages/ui/components/ui/table";
import type { ApiToken } from "../api/api-tokens.queries";

interface TokenRowProps {
  token: ApiToken;
  onRevoke: (id: string) => void;
  isRevoking: boolean;
}

export function TokenRow({ token, onRevoke, isRevoking }: TokenRowProps) {
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
      <TableCell>
        {token.lastUsedAt ? new Date(token.lastUsedAt).toLocaleDateString() : "—"}
      </TableCell>
      <TableCell>
        {token.expiresAt ? new Date(token.expiresAt).toLocaleDateString() : "Never"}
      </TableCell>
      <TableCell>
        {isRevoked && <Badge variant="destructive">Revoked</Badge>}
        {isExpired && <Badge variant="outline">Expired</Badge>}
      </TableCell>
      <TableCell>
        {!isRevoked && (
          <Button
            variant="ghost"
            size="sm"
            disabled={isRevoking}
            onClick={() => onRevoke(token.id)}
          >
            Revoke
          </Button>
        )}
      </TableCell>
    </TableRow>
  );
}
