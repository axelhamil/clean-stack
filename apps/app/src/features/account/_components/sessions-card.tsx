import { Badge } from "@packages/ui/components/ui/badge";
import { Button } from "@packages/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@packages/ui/components/ui/card";
import {
  ListRow,
  ListRowAction,
  ListRowContent,
  ListRowMedia,
  ListRowMeta,
} from "@packages/ui/components/ui/list-row";
import {
  TypographyMuted,
  TypographySmall,
} from "@packages/ui/components/ui/typography";
import { useQuery } from "@tanstack/react-query";
import { LogOutIcon, MonitorIcon } from "lucide-react";
import { sessionsQueryOptions } from "../../../adapters/queries/sessions";
import { useRevokeOtherSessions } from "../_hooks/use-revoke-other-sessions";
import { useRevokeSession } from "../_hooks/use-revoke-session";

interface SessionsCardProps {
  currentSessionToken: string;
}

export function SessionsCard({ currentSessionToken }: SessionsCardProps) {
  const { data, isLoading } = useQuery(sessionsQueryOptions);
  const revokeOthers = useRevokeOtherSessions();

  const others = data?.filter((s) => s.token !== currentSessionToken) ?? [];

  return (
    <Card>
      <CardHeader className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1.5">
          <CardTitle>Active sessions</CardTitle>
          <CardDescription>
            Devices currently signed in to your account.
          </CardDescription>
        </div>
        {others.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => revokeOthers.mutate()}
            disabled={revokeOthers.isPending}
          >
            <LogOutIcon />
            Sign out others
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <TypographyMuted>Loading…</TypographyMuted>
        ) : data && data.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {data.map((session) => (
              <SessionRow
                key={session.id}
                token={session.token}
                isCurrent={session.token === currentSessionToken}
                ipAddress={session.ipAddress ?? undefined}
                userAgent={session.userAgent ?? undefined}
                expiresAt={session.expiresAt}
              />
            ))}
          </ul>
        ) : (
          <TypographyMuted>No active sessions.</TypographyMuted>
        )}
      </CardContent>
    </Card>
  );
}

interface SessionRowProps {
  token: string;
  isCurrent: boolean;
  ipAddress?: string;
  userAgent?: string;
  expiresAt: Date;
}

function SessionRow({
  token,
  isCurrent,
  ipAddress,
  userAgent,
  expiresAt,
}: SessionRowProps) {
  const mutation = useRevokeSession();
  const expires = new Date(expiresAt).toLocaleDateString();
  const ua = userAgent ? summarizeUserAgent(userAgent) : "Unknown device";

  return (
    <ListRow>
      <ListRowMedia>
        <MonitorIcon className="size-5 text-muted-foreground" />
        <ListRowContent>
          <ListRowMeta>
            <TypographySmall>{ua}</TypographySmall>
            {isCurrent && <Badge variant="default">Current</Badge>}
          </ListRowMeta>
          <TypographyMuted>
            {ipAddress ?? "Unknown IP"} · expires {expires}
          </TypographyMuted>
        </ListRowContent>
      </ListRowMedia>
      {!isCurrent && (
        <ListRowAction>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => mutation.mutate(token)}
            disabled={mutation.isPending}
          >
            Revoke
          </Button>
        </ListRowAction>
      )}
    </ListRow>
  );
}

function summarizeUserAgent(ua: string): string {
  if (/iPhone|iPad/i.test(ua)) return "iOS device";
  if (/Android/i.test(ua)) return "Android device";
  if (/Macintosh/i.test(ua)) return "Mac";
  if (/Windows/i.test(ua)) return "Windows";
  if (/Linux/i.test(ua)) return "Linux";
  return "Browser";
}
