import { Badge } from "@packages/ui/components/ui/badge";
import { Button } from "@packages/ui/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@packages/ui/components/ui/dropdown-menu";
import { TableCell, TableRow } from "@packages/ui/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@packages/ui/components/ui/tooltip";
import { MoreHorizontalIcon, TriangleAlertIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useFormatDate } from "../../../shared/i18n/use-format-date";
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
}

export function EndpointRow({
  endpoint,
  canWrite,
  onEdit,
  onSendTest,
  onRotate,
  onDelete,
  onSelect,
}: EndpointRowProps) {
  const { t } = useTranslation(["settings", "common"]);
  const formatDate = useFormatDate();
  const status = endpointStatus(endpoint);

  return (
    <TableRow>
      <TableCell className="max-w-xs truncate font-mono text-sm">{endpoint.url}</TableCell>
      <TableCell>
        {status === "auto-disabled" ? (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant="destructive" className="flex items-center gap-1">
                  <TriangleAlertIcon className="size-3" />
                  {t(ENDPOINT_STATUS_KEYS["auto-disabled"])}
                </Badge>
              </TooltipTrigger>
              <TooltipContent>
                {t("settings:webhooks.endpointRow.autoDisabledTooltip")}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : (
          <Badge variant={status === "active" ? "default" : "secondary"}>
            {t(ENDPOINT_STATUS_KEYS[status])}
          </Badge>
        )}
      </TableCell>
      <TableCell>{endpoint.eventTypes.length}</TableCell>
      <TableCell>{formatDate(endpoint.createdAt)}</TableCell>
      <TableCell>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon">
              <MoreHorizontalIcon className="size-4" />
              <span className="sr-only">{t("settings:webhooks.endpointRow.openActions")}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onSelect(endpoint)}>
              {t("settings:webhooks.endpointRow.viewDeliveries")}
            </DropdownMenuItem>
            {canWrite && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => onEdit(endpoint)}>
                  {t("settings:webhooks.endpointRow.edit")}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onSendTest(endpoint)}>
                  {t("settings:webhooks.endpointRow.sendTest")}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onRotate(endpoint)}>
                  {t("settings:webhooks.endpointRow.rotateSecret")}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => onDelete(endpoint)}
                  className="text-destructive focus:text-destructive"
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
