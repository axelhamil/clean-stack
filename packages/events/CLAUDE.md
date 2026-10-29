# events rules

The single event catalog: every domain event type, its payload schema, retention, visibility, public description and notification mapping. Auto-loaded under `packages/events/`. Cross-cutting rules 6 and 7 (every state change emits, every payload names its actor): `/CLAUDE.md`. Emit mechanics, outbox, dispatcher, subscribers: `apps/api/CLAUDE.md`, skill `events-outbox`, `docs/EVENTS.md`.

## Layout

```
src/
  event-types.ts          `EventTypes` (const object), `ALL_EVENT_TYPES`, subscription matching (`matchesSubscription`)
  payloads.ts             one Zod payload per type, `PayloadByEventType`
  retention-map.ts        `RETENTION_MAP: Record<EventType, "operational" | "compliance" | "none">`
  visibility-map.ts       `VISIBILITY` (`satisfies Record<EventType, ...>`): `public` = webhook-subscribable, `internal` = never exposed
  event-descriptions.ts   `EVENT_DESCRIPTIONS: Record<EventType, string>`, English only
  notification-map.ts     optional `NOTIFICATION_MAP` (audience, category, allowed payload fields)
  json-schema.ts          payload schemas as JSON Schema for the public docs
```

## Declaring an event

One new type touches five files; `tsc` names the missing entries in the exhaustive `Record<EventType, ...>` maps, and the catalog tests pin the rest:

1. `event-types.ts`: the `EventTypes` entry (`"<group>.<noun>.<past_tense_verb>"`).
2. `payloads.ts`: the Zod payload and its entry in `PayloadByEventType`.
3. `retention-map.ts`: the retention class.
4. `visibility-map.ts`: `public` only if an external webhook consumer may subscribe, otherwise `internal`. **Why**: `public` is a contract with third parties; security and admin events stay `internal`.
5. `event-descriptions.ts`: one English sentence.

`notification-map.ts` entry only when the event should reach a user's inbox. **Required `fields` list, empty is valid**: what crosses to the browser is chosen, never inherited. A notification stores the whole payload and payloads carry internal handles (invitation tokens, storage keys, subscription ids), so without the list every field added later would ship to the recipient's browser by default.

## Payload contract

1. **The payload identifies its actor** (root rule 7). Recognized keys in priority order, the one list both the audit trail and the notification audience read (`ACTOR_KEYS` in the API's `shared/services/event-actor.ts`): `actorUserId` (canonical, REQUIRED when the actor differs from the subject) → `inviterUserId` → `ownerUserId` → `userId` (only when subject == actor: sign-in, self-deletion, MFA toggle). A kicked member's `userId` is the subject; the admin who kicked is `actorUserId`.
2. **System-triggered events** (cron, cascade, webhook bridge with no upstream user) make `actorUserId` nullable explicitly in the schema (`z.string().nullable()`), never implicitly.
3. **Payload fields are simple values**: ids and primitives, never a value-object instance or a class. A serialization boundary is `.value` out, `X.create` in.
4. **No orphan**: a type in the catalog without an emit site fails QA. Before adding one, find the emit call (`aggregate.addEvent(...)` inside `uow.run()`, or `emitEvent(outbox, ...)` inside `uow.run()` for service and library-bridge code); before removing a call, check the type is still emitted elsewhere.
5. **`EVENT_DESCRIPTIONS` stays English**, like the rest of the API documentation: a documented exception to the app's i18n rule.

## Commands

`pnpm --filter @packages/events test` (vitest). Add the payload test next to the schema when it carries a rule (actor required, nullable actor, a refinement).
