import { Badge } from "@packages/ui/components/ui/badge";
import { Button } from "@packages/ui/components/ui/button";
import {
  Card,
  CardAction,
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
import { TypographyMuted, TypographySmall } from "@packages/ui/components/ui/typography";
import { useQuery } from "@tanstack/react-query";
import { LogOutIcon, MonitorIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { sessionsQueryOptions } from "../../../shared/api/queries/sessions";
import { ImpersonationReason } from "../../../shared/auth/impersonation-reason";
import {
  type ImpersonationGuard,
  useImpersonationGuard,
} from "../../../shared/auth/use-impersonation-guard";
import { useFormatDate } from "../../../shared/i18n/use-format-date";
import { useRevokeOtherSessions } from "../hooks/use-revoke-other-sessions";
import { useRevokeSession } from "../hooks/use-revoke-session";

// `summarizeUserAgent` classifies, the catalog names. Keeping the two apart is
// what lets the classifier be unit-tested against raw user-agent strings while
// the copy stays in the catalog where the parity gate can see it.
export type DeviceKind = "ios" | "android" | "mac" | "windows" | "linux" | "browser";

export const DEVICE_KEYS = {
  ios: "sessions.device.ios",
  android: "sessions.device.android",
  mac: "sessions.device.mac",
  windows: "sessions.device.windows",
  linux: "sessions.device.linux",
  browser: "sessions.device.browser",
} as const satisfies Record<DeviceKind, string>;

interface SessionsCardProps {
  currentSessionToken: string;
}

export function SessionsCard({ currentSessionToken }: SessionsCardProps) {
  const { data, isLoading } = useQuery(sessionsQueryOptions);
  const revokeOthers = useRevokeOtherSessions();
  const { t } = useTranslation("settings");
  // `/revoke-session` and `/revoke-other-sessions` are on the BetterAuth
  // impersonation blocklist — an admin borrowing this account cannot end its
  // sessions.
  const guard = useImpersonationGuard();

  const others = data?.filter((s) => s.token !== currentSessionToken) ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("sessions.title")}</CardTitle>
        <CardDescription>{t("sessions.description")}</CardDescription>
        {others.length > 0 && (
          <CardAction>
            <Button
              variant="outline"
              size="sm"
              onClick={() => revokeOthers.mutate()}
              disabled={revokeOthers.isPending || guard.blocked}
              {...guard.describeProps(revokeOthers.isPending)}
            >
              <LogOutIcon />
              {t("sessions.signOutOthers")}
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <TypographyMuted>{t("sessions.loading")}</TypographyMuted>
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
                guard={guard}
              />
            ))}
          </ul>
        ) : (
          <TypographyMuted>{t("sessions.empty")}</TypographyMuted>
        )}
        <ImpersonationReason guard={guard} />
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
  guard: ImpersonationGuard;
}

function SessionRow({ token, isCurrent, ipAddress, userAgent, expiresAt, guard }: SessionRowProps) {
  const formatDate = useFormatDate();
  const mutation = useRevokeSession();
  const { t } = useTranslation("settings");
  const expires = formatDate(expiresAt);
  const ua = userAgent
    ? t(DEVICE_KEYS[summarizeUserAgent(userAgent)])
    : t("sessions.unknownDevice");

  return (
    <ListRow>
      <ListRowMedia>
        <MonitorIcon />
        <ListRowContent>
          <ListRowMeta>
            <TypographySmall>{ua}</TypographySmall>
            {isCurrent && <Badge variant="secondary">{t("sessions.current")}</Badge>}
          </ListRowMeta>
          <TypographyMuted>
            {t("sessions.expiresAt", { ip: ipAddress ?? t("sessions.unknownIp"), date: expires })}
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
            disabled={mutation.isPending || guard.blocked}
            {...guard.describeProps(mutation.isPending)}
          >
            {t("sessions.revoke")}
          </Button>
        </ListRowAction>
      )}
    </ListRow>
  );
}

export function summarizeUserAgent(ua: string): DeviceKind {
  if (/iPhone|iPad/i.test(ua)) return "ios";
  if (/Android/i.test(ua)) return "android";
  if (/Macintosh/i.test(ua)) return "mac";
  if (/Windows/i.test(ua)) return "windows";
  if (/Linux/i.test(ua)) return "linux";
  return "browser";
}
