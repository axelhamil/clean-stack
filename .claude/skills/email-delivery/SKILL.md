---
name: email-delivery
description: Use when working on outgoing email, the queue, the delivery worker, Resend batching, templates or retry. Trigger on "email", "Resend", "sendTemplate", "EmailDeliveryWorker", "email_message", "template", "jitter". Not for auth email URL building.
---

# Email delivery (`shared/services/`)

**Emails enqueued, never sent inline.** `IEmailService` (`QueuedEmailService`) writes to `email_message` through the ambient executor: inside a `uow.run()` the row joins the caller's TX (atomic), outside one it autocommits. `EmailDeliveryWorker` polls every 2 s, delivers via `resend.batch.send` (100 emails/request, 10 req/s ceiling, `batchValidation: "permissive"`).

- **Never call Resend directly from a request path.** Use `di.IEmailService.sendTemplate(...)` or `di.IEmailService.sendTemplateBatch(...)`.
- **Failure is best-effort**: logs at `warn`, never rolls back the caller.
- **`@packages/emails` is the template SSOT.** `TEMPLATE_IDS` in the worker is an override; empty string = render in-repo React Email template. New templates: add to both the package and the `EmailTemplates` port type.
- **Lease model, same as the outbox.** The worker claims with `IEmailQueue.claim({ limit, leaseSeconds })` (one statement, database clock, `attempts + 1`, `next_attempt_at = now() + EMAIL_LEASE_SECONDS`) and settles with `markSent` / `markFailed` guarded by the claimed `attempts`; both report what they wrote. A settle that wrote nothing emits nothing. Why: a worker whose lease expired must not overwrite the one that reclaimed the row. On stop, unstarted chunks are released (`attempts - 1`, due now).
- **Retry via decorrelated jitter** (`shared/jitter.ts`, `failureSchedule`). A retryable failure keeps the row `pending`; on its 4th failed send it is `dead` and replayed every `EMAIL_DEAD_RETRY_HOURS`, only while younger than `EMAIL_DEAD_REPLAY_WINDOW_HOURS` (a stale reset or sign-in link is never sent late). A permanent rejection is `failed`, terminal, never claimed. `email.delivery.exhausted` is emitted once, on the first death or the permanent rejection, in the settle's unit of work. The sweep purges `failed` and `dead` together. The batch call aborts after `EMAIL_SEND_TIMEOUT_SECONDS` (retryable), the worker releases the chunks its remaining lease no longer covers, and a row that fails to render is settled `failed` alone without stopping the chunk.
- Proven by `check:email-lease` and `check:marksent`; re-run both after touching the queue or the worker.
