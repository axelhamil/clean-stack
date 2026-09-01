---
name: email-delivery
description: Use when working on outgoing email — the queue, the delivery worker, Resend batching, templates or retry. Trigger on "email", "Resend", "sendTemplate", "EmailDeliveryWorker", "email_message", "template", "jitter". Not for auth email URL building.
---

# Email delivery (`shared/services/`)

**Emails enqueued, never sent inline.** `IEmailService` (`QueuedEmailService`) writes to `email_message` inside the caller's TX when `options.tx` is passed (atomic). `EmailDeliveryWorker` polls every 2 s, delivers via `resend.batch.send` (100 emails/request, 10 req/s ceiling, `batchValidation: "permissive"`).

- **Never call Resend directly from a request path.** Use `di.IEmailService.sendTemplate(...)` or `di.IEmailService.sendTemplateBatch(...)`.
- **Failure is best-effort** — logs at `warn`, never rolls back the caller.
- **`@packages/emails` is the template SSOT.** `TEMPLATE_IDS` in the worker is an override; empty string = render in-repo React Email template. New templates: add to both the package and the `EmailTemplates` port type.
- **Retry via decorrelated jitter** (`shared/jitter.ts`). Exhausted messages emit `email.delivery.exhausted`.
