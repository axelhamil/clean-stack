import { descriptionFor, eventGroupOf, SUBSCRIBABLE_EVENT_TYPES } from "@packages/events";
import { Checkbox } from "@packages/ui/components/ui/checkbox";
import { useTranslation } from "react-i18next";

export interface EventGroup {
  group: string;
  wildcard: string;
  events: readonly string[];
}

export function groupedSubscribableEvents(): EventGroup[] {
  const byGroup = new Map<string, string[]>();
  for (const type of SUBSCRIBABLE_EVENT_TYPES) {
    const group = eventGroupOf(type);
    const list = byGroup.get(group) ?? [];
    list.push(type);
    byGroup.set(group, list);
  }
  return [...byGroup.entries()].map(([group, events]) => ({
    group,
    wildcard: `${group}.*`,
    events,
  }));
}

interface EventTypePickerProps {
  value: string[];
  onChange: (next: string[]) => void;
}

export function EventTypePicker({ value, onChange }: EventTypePickerProps) {
  const { t } = useTranslation("settings");
  const groups = groupedSubscribableEvents();
  const selected = new Set(value);
  const allSelected = selected.has("*");

  const toggle = (selector: string, on: boolean) => {
    const next = new Set(selected);
    if (on) next.add(selector);
    else next.delete(selector);
    onChange([...next]);
  };

  return (
    <div className="space-y-4">
      {/* biome-ignore lint/a11y/noLabelWithoutControl: Checkbox renders native checkbox input internally */}
      <label className="flex items-center gap-2">
        <Checkbox checked={allSelected} onCheckedChange={(c) => toggle("*", c === true)} />
        <span className="font-medium">{t("webhooks.eventTypePicker.allEvents")}</span>
      </label>
      {groups.map((g) => {
        const groupSelected = selected.has(g.wildcard);
        const disabled = allSelected;
        return (
          <fieldset key={g.group} className="space-y-2" disabled={disabled}>
            {/* biome-ignore lint/a11y/noLabelWithoutControl: Checkbox renders native checkbox input internally */}
            <label className="flex items-center gap-2">
              <Checkbox
                checked={groupSelected}
                onCheckedChange={(c) => toggle(g.wildcard, c === true)}
              />
              <span className="font-medium capitalize">
                {t("webhooks.eventTypePicker.groupWildcard", { group: g.group })}
              </span>
            </label>
            <div className="ml-6 space-y-1">
              {g.events.map((type) => {
                return (
                  // biome-ignore lint/a11y/noLabelWithoutControl: Checkbox renders native checkbox input internally
                  <label key={type} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={groupSelected || allSelected || selected.has(type)}
                      disabled={groupSelected}
                      onCheckedChange={(c) => toggle(type, c === true)}
                    />
                    <span className="font-mono">{type}</span>
                    <span className="text-muted-foreground">{descriptionFor(type)}</span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        );
      })}
    </div>
  );
}
