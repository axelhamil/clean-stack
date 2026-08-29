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
import { formatDate } from "../../../shared/utils";
import type { WebhookEndpoint } from "../api/webhooks.queries";

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
  const { i18n } = useTranslation();
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
                  auto-disabled
                </Badge>
              </TooltipTrigger>
              <TooltipContent>
                Disabled after repeated delivery failures — re-enable to reset
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : (
          <Badge variant={status === "active" ? "default" : "secondary"}>{status}</Badge>
        )}
      </TableCell>
      <TableCell>{endpoint.eventTypes.length}</TableCell>
      <TableCell>{formatDate(endpoint.createdAt, i18n.language)}</TableCell>
      <TableCell>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon">
              <MoreHorizontalIcon className="size-4" />
              <span className="sr-only">Open actions</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onSelect(endpoint)}>View deliveries</DropdownMenuItem>
            {canWrite && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => onEdit(endpoint)}>Edit</DropdownMenuItem>
                <DropdownMenuItem onClick={() => onSendTest(endpoint)}>Send test</DropdownMenuItem>
                <DropdownMenuItem onClick={() => onRotate(endpoint)}>
                  Rotate secret
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => onDelete(endpoint)}
                  className="text-destructive focus:text-destructive"
                >
                  Delete
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );
}
