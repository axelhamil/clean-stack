import { Badge } from "@packages/ui/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@packages/ui/components/ui/dropdown-menu";
import { Hint } from "@packages/ui/components/ui/hint";
import { IconButton } from "@packages/ui/components/ui/icon-button";
import { TableCell, TableRow } from "@packages/ui/components/ui/table";
import { TruncatedText } from "@packages/ui/components/ui/truncated-text";
import { TypographyInline } from "@packages/ui/components/ui/typography";
import { useFormatDate } from "@packages/web-kit/i18n/use-format-date";
import { MoreHorizontalIcon, TriangleAlertIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { ImpersonationGuard } from "../../../shared/auth/use-impersonation-guard";
import type { WebhookEndpoint } from "../api/webhooks.queries";
import { ENDPOINT_STATUS_KEYS } from "../webhook-labels";

export type EndpointStatus = "active" | "paused" | "auto-disabled";

export function endpointStatus(e: Pick<WebhookEndpoint, "enabled" | "disabledAt">): EndpointStatus {
  if (e.enabled) return "active";
  return e.disabledAt ? "auto-disabled" : "paused";
}

interface EndpointRowProps {
  endpoint: WebhookEndpoint;
  canWrite: boolean;
  onEdit: (endpoint: WebhookEndpoint) => void;
  onSendTest: (endpoint: WebhookEndpoint) => void;
  onRotate: (endpoint: WebhookEndpoint) => void;
  onDelete: (endpoint: WebhookEndpoint) => void;
  onSelect: (endpoint: WebhookEndpoint) => void;
  guard: ImpersonationGuard;
}

export function EndpointRow({
  endpoint,
  canWrite,
  onEdit,
  onSendTest,
  onRotate,
  onDelete,
  onSelect,
  guard,
}: EndpointRowProps) {
  const { t } = useTranslation(["settings", "common"]);
  const formatDate = useFormatDate();
  const status = endpointStatus(endpoint);

  return (
    <TableRow>
      <TableCell>
        <TruncatedText value={endpoint.url} font="mono" className="max-w-32 sm:max-w-xs" />
        <TypographyInline tone="muted" size="xs" className="block sm:hidden">
          {formatDate(endpoint.createdAt)}
        </TypographyInline>
      </TableCell>
      <TableCell>
        {status === "auto-disabled" ? (
          <Hint text={t("settings:webhooks.endpointRow.autoDisabledTooltip")}>
            <Badge variant="destructive">
              <TriangleAlertIcon />
              {t(ENDPOINT_STATUS_KEYS["auto-disabled"])}
            </Badge>
          </Hint>
        ) : (
          <Badge variant={status === "active" ? "default" : "secondary"}>
            {t(ENDPOINT_STATUS_KEYS[status])}
          </Badge>
        )}
      </TableCell>
      <TableCell className="hidden sm:table-cell">{endpoint.eventTypes.length}</TableCell>
      <TableCell className="hidden sm:table-cell">{formatDate(endpoint.createdAt)}</TableCell>
      <TableCell>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <IconButton variant="ghost" label={t("settings:webhooks.endpointRow.openActions")}>
              <MoreHorizontalIcon />
            </IconButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onSelect(endpoint)}>
              {t("settings:webhooks.endpointRow.viewDeliveries")}
            </DropdownMenuItem>
            {canWrite && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => onEdit(endpoint)}
                  disabled={guard.blocked}
                  {...guard.describeProps()}
                >
                  {t("settings:webhooks.endpointRow.edit")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => onSendTest(endpoint)}
                  disabled={guard.blocked}
                  {...guard.describeProps()}
                >
                  {t("settings:webhooks.endpointRow.sendTest")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => onRotate(endpoint)}
                  disabled={guard.blocked}
                  {...guard.describeProps()}
                >
                  {t("settings:webhooks.endpointRow.rotateSecret")}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => onDelete(endpoint)}
                  disabled={guard.blocked}
                  {...guard.describeProps()}
                  variant="destructive"
                >
                  {t("settings:webhooks.endpointRow.delete")}
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );
}
