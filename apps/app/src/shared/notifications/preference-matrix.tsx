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
import { useTranslation } from "react-i18next";
import type { ImpersonationGuard } from "../auth/use-impersonation-guard";
import type { PreferenceRow } from "./build-preference-matrix";
import { CATEGORY_KEYS } from "./notification-item";

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
  guard: ImpersonationGuard;
}

// Reuses Task 3's `CATEGORY_KEYS` (shared/notifications/notification-item.tsx)
// rather than declaring a second category->key map: this matrix's `row.category`
// is the same `NotificationCategory` union, so a second copy would be two
// records naming the same categories (recipe rule #2's second occurrence).
// Resolved through `common`'s own `t`, not this component's `settings` one —
// the keys aren't namespace-prefixed because Task 3 wrote them for a plain
// `useTranslation("common")` call site.

// `satisfies Record<NotificationFrequency, string>` proves every frequency has
// AN entry; `__tests__/preference-matrix.test.ts` asserts the mapping itself
// so a swapped pair (e.g. `hourly` pointing at `frequency.daily`) can't ship
// silently.
export const FREQUENCY_KEYS = {
  immediate: "notifications.frequency.immediate",
  hourly: "notifications.frequency.hourly",
  daily: "notifications.frequency.daily",
} as const satisfies Record<NotificationFrequency, string>;

// Same rationale as `FREQUENCY_KEYS` above: `satisfies` only proves the three
// forced levels are present, not that each points at the right note (or at
// `null` for "none"). Exported so the mapping is assertable directly.
export const FORCED_NOTE_KEYS = {
  all: "notifications.forcedAll",
  some: "notifications.forcedSome",
  none: null,
} as const;

export function PreferenceMatrix({
  rows,
  onChange,
  showLock = false,
  disabled = false,
  guard,
}: PreferenceMatrixProps) {
  const { t } = useTranslation("settings");
  const { t: tCommon } = useTranslation("common");

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t("notifications.categoryHeader")}</TableHead>
          <TableHead>{t("notifications.inAppHeader")}</TableHead>
          <TableHead>{t("notifications.emailHeader")}</TableHead>
          <TableHead>{t("notifications.emailFrequencyHeader")}</TableHead>
          {showLock && <TableHead>{t("notifications.enforceHeader")}</TableHead>}
        </TableRow>
      </TableHeader>

      <TableBody>
        {rows.map((row) => {
          const forced = forcedLevelOf(row.category);
          const noteKey = FORCED_NOTE_KEYS[forced];
          // The row can be frozen for three unrelated reasons (pending save,
          // an org-forced category, impersonation); the frequency select adds a
          // fourth (its channel is off). `describeProps` is what keeps a
          // forced-category row from explaining itself with a sentence about
          // impersonation, which isn't its cause.
          const otherwiseFrozen = disabled || forced === "all";
          const frozen = otherwiseFrozen || guard.blocked;
          const describe = guard.describeProps(otherwiseFrozen);
          const categoryLabel = tCommon(CATEGORY_KEYS[row.category]);

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
                <TypographySmall>{categoryLabel}</TypographySmall>
                {noteKey && <TypographyMuted>{t(noteKey)}</TypographyMuted>}
              </TableCell>

              <TableCell>
                <Switch
                  checked={row.in_app.enabled}
                  disabled={frozen}
                  {...describe}
                  onCheckedChange={(enabled) => emit("in_app", { enabled })}
                  aria-label={t("notifications.inAppAriaLabel", { category: categoryLabel })}
                />
              </TableCell>

              <TableCell>
                <Switch
                  checked={row.email.enabled}
                  disabled={frozen}
                  {...describe}
                  onCheckedChange={(enabled) => emit("email", { enabled })}
                  aria-label={t("notifications.emailAriaLabel", { category: categoryLabel })}
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
                    aria-label={t("notifications.emailFrequencyAriaLabel", {
                      category: categoryLabel,
                    })}
                    {...guard.describeProps(otherwiseFrozen || !row.email.enabled)}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {NOTIFICATION_FREQUENCIES.map((frequency) => (
                      <SelectItem key={frequency} value={frequency}>
                        {t(FREQUENCY_KEYS[frequency])}
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
                    {...describe}
                    onCheckedChange={(locked) => {
                      emit("in_app", { locked });
                      emit("email", { locked });
                    }}
                    aria-label={t("notifications.enforceAriaLabel", { category: categoryLabel })}
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
