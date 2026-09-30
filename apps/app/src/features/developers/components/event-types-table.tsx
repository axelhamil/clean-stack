import {
  descriptionFor,
  eventGroupOf,
  jsonSchemaForEvent,
  retentionFor,
  SUBSCRIBABLE_EVENT_TYPES,
} from "@packages/events";
import { Badge } from "@packages/ui/components/ui/badge";
import { CodeBlock } from "@packages/ui/components/ui/code-block";
import { Panel } from "@packages/ui/components/ui/panel";
import { TypographyInline } from "@packages/ui/components/ui/typography";

export function EventTypesTable() {
  return (
    <div className="flex flex-col gap-2">
      {SUBSCRIBABLE_EVENT_TYPES.map((type) => (
        <Panel key={type} asChild>
          <details>
            <summary className="flex cursor-pointer flex-wrap items-center gap-3">
              <code className="text-sm">{type}</code>
              <Badge variant="secondary">{eventGroupOf(type)}</Badge>
              <Badge variant="outline">{retentionFor(type)}</Badge>
              <TypographyInline tone="muted" size="sm">
                {descriptionFor(type)}
              </TypographyInline>
            </summary>
            <CodeBlock className="mt-3">
              <code>{JSON.stringify(jsonSchemaForEvent(type), null, 2)}</code>
            </CodeBlock>
          </details>
        </Panel>
      ))}
    </div>
  );
}
