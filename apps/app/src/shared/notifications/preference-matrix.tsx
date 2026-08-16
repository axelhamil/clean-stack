import {
  forcedLevelOf,
  NOTIFICATION_FREQUENCIES,
  type NotificationCategory,
  type NotificationChannel,
  type NotificationFrequency,
} from "@packages/events";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@packages/ui/components/ui/select";
import { Switch } from "@packages/ui/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@packages/ui/components/ui/table";
import { TypographyMuted, TypographySmall } from "@packages/ui/components/ui/typography";
import type { PreferenceRow } from "./build-preference-matrix";

export interface PreferenceChange {
  category: NotificationCategory;
  channel: NotificationChannel;
  enabled: boolean;
  frequency: NotificationFrequency;
  locked: boolean;
}

interface PreferenceMatrixProps {
  rows: PreferenceRow[];
  onChange: (change: PreferenceChange) => void;
  showLock?: boolean;
  disabled?: boolean;
}

const CATEGORY_LABELS: Record<NotificationCategory, string> = {
  security: "Security",
  org: "Organization",
  billing: "Billing",
  activity: "Activity",
};

const FREQUENCY_LABELS: Record<NotificationFrequency, string> = {
  immediate: "Immediately",
  hourly: "Hourly digest",
  daily: "Daily digest",
};

const FORCED_NOTE = {
  all: "Always sent. Critical account alerts cannot be turned off.",
  some: "Some critical alerts in this category are always sent.",
  none: null,
} as const;

export function PreferenceMatrix({
  rows,
  onChange,
  showLock = false,
  disabled = false,
}: PreferenceMatrixProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Category</TableHead>
          <TableHead>In app</TableHead>
          <TableHead>Email</TableHead>
          <TableHead>Email frequency</TableHead>
          {showLock && <TableHead>Enforce for members</TableHead>}
        </TableRow>
      </TableHeader>

      <TableBody>
        {rows.map((row) => {
          const forced = forcedLevelOf(row.category);
          const note = FORCED_NOTE[forced];
          const frozen = disabled || forced === "all";

          const emit = (channel: NotificationChannel, patch: Partial<PreferenceChange>) =>
            onChange({
              category: row.category,
              channel,
              enabled: row[channel].enabled,
              frequency: row[channel].frequency,
              locked: row[channel].locked,
              ...patch,
            });

          return (
            <TableRow key={row.category}>
              <TableCell>
                <TypographySmall>{CATEGORY_LABELS[row.category]}</TypographySmall>
                {note && <TypographyMuted>{note}</TypographyMuted>}
              </TableCell>

              <TableCell>
                <Switch
                  checked={row.in_app.enabled}
                  disabled={frozen}
                  onCheckedChange={(enabled) => emit("in_app", { enabled })}
                  aria-label={`In-app notifications for ${CATEGORY_LABELS[row.category]}`}
                />
              </TableCell>

              <TableCell>
                <Switch
                  checked={row.email.enabled}
                  disabled={frozen}
                  onCheckedChange={(enabled) => emit("email", { enabled })}
                  aria-label={`Email notifications for ${CATEGORY_LABELS[row.category]}`}
                />
              </TableCell>

              <TableCell>
                <Select
                  value={row.email.frequency}
                  disabled={frozen || !row.email.enabled}
                  onValueChange={(frequency) =>
                    emit("email", { frequency: frequency as NotificationFrequency })
                  }
                >
                  <SelectTrigger
                    aria-label={`Email frequency for ${CATEGORY_LABELS[row.category]}`}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {NOTIFICATION_FREQUENCIES.map((frequency) => (
                      <SelectItem key={frequency} value={frequency}>
                        {FREQUENCY_LABELS[frequency]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </TableCell>

              {showLock && (
                <TableCell>
                  <Switch
                    checked={row.in_app.locked}
                    disabled={frozen}
                    onCheckedChange={(locked) => {
                      emit("in_app", { locked });
                      emit("email", { locked });
                    }}
                    aria-label={`Enforce ${CATEGORY_LABELS[row.category]} for all members`}
                  />
                </TableCell>
              )}
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
