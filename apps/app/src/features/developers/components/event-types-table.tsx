import {
  descriptionFor,
  eventGroupOf,
  jsonSchemaForEvent,
  retentionFor,
  SUBSCRIBABLE_EVENT_TYPES,
} from "@packages/events";
import { Badge } from "@packages/ui/components/ui/badge";

export function EventTypesTable() {
  return (
    <div className="space-y-2">
      {SUBSCRIBABLE_EVENT_TYPES.map((type) => (
        <details key={type} className="rounded-md border p-3">
          <summary className="flex cursor-pointer flex-wrap items-center gap-3">
            <code className="text-sm">{type}</code>
            <Badge variant="secondary">{eventGroupOf(type)}</Badge>
            <Badge variant="outline">{retentionFor(type)}</Badge>
            <span className="text-sm text-muted-foreground">{descriptionFor(type)}</span>
          </summary>
          <pre className="mt-3 overflow-x-auto rounded bg-muted p-3 text-xs">
            <code>{JSON.stringify(jsonSchemaForEvent(type), null, 2)}</code>
          </pre>
        </details>
      ))}
    </div>
  );
}
