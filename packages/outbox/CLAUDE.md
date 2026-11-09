# outbox rules

The transactional outbox kit: the outbox port, the emit helpers, the Drizzle outbox repository, the relay, the dispatcher, the Postgres listener and the delivery-queue mechanics (`jitter`, `lease-budget`, `race-with-timeout`) the email queue and webhook delivery reuse. Auto-loaded under `packages/outbox/`. Consumer: `apps/api` (container wiring, built-in subscribers, every emit site). Event catalog and payload contract: `packages/events/CLAUDE.md`; unit of work: `packages/drizzle/CLAUDE.md`.

## Layout

```
src/
  outbox.port.ts               `IOutboxRepository`, `DeliveredEvent` (transport fields: `organizationId`, `requestId`, `aggregateType`)
  event-emitter.ts             `emitEvent`, `emitEventBestEffort`
  event-handlers.ts            `BuiltInEventHandler`, `buildEventDispatcher` (built-ins on every catalog type + `onEvent` handlers found in the container)
  event-actor.ts               `ACTOR_KEYS` + `readUserId`, the one actor-key priority list the audit trail and the notification audience read
  drizzle-outbox.repository.ts `DrizzleOutboxRepository`
  outbox-relay.ts              `OutboxRelay`, `OUTBOX_SETTLE_MARGIN_SECONDS`
  outbox-dispatcher.ts         `OutboxDispatcher` (LISTEN wake, `pendingState().dueInMs`, 30 s poll)
  pg-listener.ts               `PgListener` (dedicated LISTEN connection, keepalive, reconnect)
  payload-parser.ts            `payloadParser(schema)`, the `onEvent` payload parser built from a catalog Zod schema
  handler-idempotency.ts       `handlerIdempotency(name, event)`, the key a handler passes to an outside call so a redelivery never sends twice
  jitter.ts, lease-budget.ts, race-with-timeout.ts   retry schedule, lease budget, timeout race shared by every lease worker
  testing/                     test doubles (`enqueuedEvents`, fake listen client), imported by tests only
```

## Rules

1. **The package reads no environment and owns no process singleton.** Logger (`ILogger`), instrumentation, the request-id reader and every bound or knob arrive through constructors or arguments; the host maps its env onto them. `src/__TESTS__/layering.test.ts` enforces it. **Why**: a kit that reads env or imports a host logger cannot be reused by a second app or tested without a full `.env`.
2. **`emitEvent(outbox, ...)` for code that emits outside an aggregate flow, inside the same `uow.run()` as the write.** The outbox reads the ambient executor: inside a run the row commits or rolls back with the write, outside one it autocommits. Use it instead of `outbox.enqueue` directly so the source and scope shape stay consistent. `emitEventBestEffort(outbox, logger, ...)` is for a request refused whatever happens to its event (CSRF, rate limit, CSP report, abuse checks): a failed emit is logged as a warning instead of turning the refusal into a 500.
3. **Handlers run after commit, outside any transaction**, through `OutboxRelay`, driven by `OutboxDispatcher`. Events are claimed by lease (`IOutboxRepository.claim`: `FOR UPDATE SKIP LOCKED` then `attempts + 1` and `next_attempt_at = now() + lease`, one statement) and settled with `markDelivered`/`markFailed`/`release` guarded by the claimed `attempts`, each reporting whether it wrote, so a settle after the lease expired writes nothing and is neither counted nor announced; `deliveries` records each handler that succeeded and merges server side, so a retry runs only the handlers that failed. The relay is built by a factory the host injects into `OutboxDispatcher`.
4. **Every handler is idempotent (keyed on `eventId`) and surfaces its failure**: a user handler returns a failed `Result` (`onEvent` throws it, keeping application code throw-free), never swallows it nor captures it, since the relay logs and reports every failure. A failure or a timeout (handler budget) retries the handler with jitter; after the max attempts the event is dead, announced once by `OUTBOX_EVENT_DEAD` in the same unit of work as its `dead_at` write and replayed on the dead-retry cadence. A stored error is scrubbed and bounded before it reaches `last_error` and the audit trail. Shutdown releases abandoned or unstarted rows without an attempt penalty. The lease must cover the handler budget + `OUTBOX_SETTLE_MARGIN_SECONDS`; the host enforces it at boot. Proven by `check:outbox-lease` (`apps/api`).
5. **Every lease worker runs the same model** (the outbox relay here, `EmailDeliveryWorker` in `packages/email`, `WebhookDeliveryWorker` in `apps/api`; shared SQL in `packages/drizzle/src/lease.ts`, failure schedule in `jitter.ts`): claim by lease in one statement with the database clock (dead rows that are due take at most a quarter of a claim), settle guarded by the claimed `attempts` and reporting whether it wrote, no transaction held across a network call, release on stop. **Why**: a claim made with the process clock or a settle that matches the id alone lets a worker whose lease expired overwrite the one that reclaimed the row, double-counting and double-announcing. A settle that wrote nothing records no counter, no event, no endpoint bump. A message or delivery is dead after 5 attempts and replayed on a slow cadence (email status `dead`, webhook `dead_letter` with a `next_attempt_at`; a webhook `dead_letter` with a null one is terminal, and so is an email `failed`, a permanent rejection). The exhausted event (`EMAIL_DELIVERY_EXHAUSTED`, `WEBHOOK_DELIVERY_EXHAUSTED`) is emitted once, on the first death, in the settle's unit of work. Proven by `check:email-lease`, `check:webhook-lease` and `check:marksent` (`apps/api`).
